<template>
  <div class="sbep-wrap">
    <div class="sbep-main">
      <div v-if="loading" class="sbep-state muted">Loading event…</div>
      <div v-else-if="error" class="sbep-state error-box">{{ error }}</div>
      <template v-else-if="detail">
        <SkillBuildersEventPortalLayout
          :title="detail.event?.title || eventNounFallback"
          :subtitle="headerSubtitle"
          :kicker="portalKicker"
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

          <div v-show="dashHubMode && hubRailItems.length" class="sbep-hub">
            <section class="sbep-hub-hero" aria-labelledby="sbep-hub-hero-title">
              <p class="sbep-hub-eyebrow">Event workspace</p>
              <h2 id="sbep-hub-hero-title" class="sbep-hub-hero-title">
                Event workspace overview
              </h2>
              <p class="sbep-hub-hero-sub">
                Choose a section below to manage this event. Use the tabs for quick switching, or open a section card to
                jump straight into the workspace.
              </p>
              <div class="sbep-hub-hero-actions">
                <button type="button" class="btn btn-secondary btn-sm" @click="selectRailSection('event-chat')">
                  Post an update
                </button>
              </div>
              <div v-if="hubQuickStats.length" class="sbep-hub-stats" role="list">
                <div v-for="s in hubQuickStats" :key="s.label" class="sbep-hub-stat" role="listitem">
                  <span class="sbep-hub-stat-val">{{ s.value }}</span>
                  <span class="sbep-hub-stat-lbl">{{ s.label }}</span>
                </div>
              </div>
            </section>
            <nav
              v-if="eventRailItems.length"
              class="sbep-event-tabs sbep-event-tabs--hub"
              aria-label="Event sections (tabs)"
            >
              <div class="sbep-event-tabs-scroll">
                <button
                  v-for="item in eventRailItems"
                  :key="`hub-tab-${item.id}`"
                  type="button"
                  class="sbep-event-tab"
                  @click="selectRailSection(item.id)"
                >
                  <span class="sbep-event-tab-label">{{ item.shortLabel }}</span>
                  <span class="sbep-event-tab-meta">{{ tabMetaLine(item.id) }}</span>
                </button>
              </div>
            </nav>
            <p class="sbep-hub-section-label">Sections</p>
            <div class="sbep-hub-panels" role="navigation" aria-label="Event sections">
              <button
                v-for="item in hubRailItems"
                :key="item.id"
                type="button"
                class="sbep-hub-panel"
                @click="selectRailSection(item.id)"
              >
                <span class="sbep-hub-panel-top">
                  <span class="sbep-hub-panel-title">{{ item.label }}</span>
                  <span class="sbep-hub-panel-arrow" aria-hidden="true">→</span>
                </span>
                <span class="sbep-hub-panel-teaser">{{ sectionTeaser(item.id) }}</span>
                <span class="sbep-hub-panel-cta">Open workspace</span>
              </button>
            </div>
          </div>

          <nav
            v-show="detail && eventRailItems.length && !dashHubMode"
            class="sbep-event-tabs sbep-event-tabs--dash"
            aria-label="Event sections (tabs)"
          >
            <div class="sbep-event-tabs-scroll">
              <button
                v-for="item in eventRailItems"
                :key="`dash-tab-${item.id}`"
                type="button"
                class="sbep-event-tab"
                :class="{ active: railActive === item.id }"
                :aria-current="railActive === item.id ? 'page' : undefined"
                @click="selectRailSection(item.id)"
              >
                <span class="sbep-event-tab-label">{{ item.shortLabel }}</span>
                <span class="sbep-event-tab-meta">{{ tabMetaLine(item.id) }}</span>
              </button>
            </div>
          </nav>

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
                  <span class="sbep-rail-mark" aria-hidden="true">{{ railTextMark(item.shortLabel) }}</span>
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
              icon-url=""
            >
              <p class="muted small sbep-card-lead">
                Overview of this program event. Use the tabs above the workspace or the rail on the left to switch between
                schedule, roster, materials, and the rest of the event.
              </p>
              <ul v-if="detail.skillsGroup" class="sbep-list muted small sbep-home-meta">
                <li>
                  <strong>{{ detail.skillsGroup.name }}</strong>
                  · {{ detail.skillsGroup.schoolName }}
                </li>
                <li>Program dates: {{ formatDateOnly(detail.skillsGroup.startDate) }} – {{ formatDateOnly(detail.skillsGroup.endDate) }}</li>
              </ul>
              <p class="muted small">{{ headerSubtitle }}</p>
              <p v-if="eventAboutText" class="muted small sbep-card-lead">{{ eventAboutText }}</p>
              <div v-if="programEventsHref || programEnrollHubHref || dashboardHref" class="sbep-inline-actions sbep-home-links">
                <router-link v-if="programEnrollHubHref" class="btn btn-secondary btn-sm" :to="programEnrollHubHref">
                  Public enroll page
                </router-link>
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
              icon-url=""
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

              <div class="sbep-sched-block">
                <p class="sbep-subh">Dates &amp; locations</p>
                <p class="muted small sbep-card-lead">
                  Event-level defaults are listed first. Each date below only needs attention when it is an exception.
                </p>
                <div v-if="scheduleDefaults" class="sbep-schedule-defaults">
                  <div class="sbep-default-chip" :class="{ good: scheduleDefaults.allSameModality }">
                    <span class="sbep-default-kicker">Modality</span>
                    <strong>{{ scheduleDefaults.modality || 'Set per date' }}</strong>
                    <small>{{ scheduleDefaults.allSameModality ? 'All sessions' : (scheduleDefaults.modality ? 'Has overrides' : 'Set per date') }}</small>
                  </div>
                  <div class="sbep-default-chip" :class="{ good: scheduleDefaults.allSameLocation }">
                    <span class="sbep-default-kicker">Location</span>
                    <strong>{{ scheduleDefaults.location || 'Set per date' }}</strong>
                    <small>{{ scheduleDefaults.allSameLocation ? 'All sessions' : (scheduleDefaults.location ? 'Has overrides' : 'Set per date') }}</small>
                  </div>
                  <div class="sbep-default-chip" :class="{ good: scheduleDefaults.allSameTime }">
                    <span class="sbep-default-kicker">Time</span>
                    <strong>{{ scheduleDefaults.time || 'Set per date' }}</strong>
                    <small>{{ scheduleDefaults.allSameTime ? 'All sessions' : 'Overrides by date' }}</small>
                  </div>
                  <div class="sbep-default-chip">
                    <span class="sbep-default-kicker">Exceptions</span>
                    <strong>{{ scheduleDefaults.overrideCount }}</strong>
                    <small>Dates differing from defaults</small>
                  </div>
                </div>
                <div
                  v-if="viewerCaps.canManageCompanyEvent && scheduleDefaults?.hasEventDefaults && sessions.length"
                  class="sbep-apply-defaults-row"
                >
                  <button
                    type="button"
                    class="btn btn-sm btn-outline"
                    :disabled="applyDefaultsLoading"
                    @click="applyEventDefaultsToAllSessions"
                  >
                    {{ applyDefaultsLoading ? 'Applying…' : 'Apply event defaults to all sessions' }}
                  </button>
                  <small class="muted">Stamps the location &amp; modality from event settings onto every session row at once.</small>
                </div>
                <div v-if="sessionsLoading" class="muted">Loading sessions…</div>
                <div v-else-if="sessions.length" class="sbep-sessions-table-wrap">
                  <table class="sbep-sessions-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Time</th>
                        <th v-if="scheduleTableShowsLocation">Location</th>
                        <th v-if="scheduleTableShowsModality">Modality</th>
                      </tr>
                    </thead>
                    <tbody>
                      <template v-for="s in sessionsTableRows" :key="`row-${s.id}`">
                        <tr>
                          <td>{{ formatSessionDateDisplay(s.sessionDate) }}</td>
                          <td>{{ sessionTimeText(s) }}</td>
                          <td v-if="scheduleTableShowsLocation">{{ sessionLocationText(s) || '—' }}</td>
                          <td v-if="scheduleTableShowsModality">{{ sessionModalityText(s) || '—' }}</td>
                        </tr>
                        <tr v-if="viewerCaps.canManageCompanyEvent" class="sbep-sessions-edit-row">
                          <td :colspan="scheduleEditColspan">
                            <div class="sbep-inline-edit-grid">
                              <input
                                v-model.trim="sessionEditDraft[s.id].locationLabel"
                                class="input"
                                type="text"
                                placeholder="Location label"
                              />
                              <input
                                v-model.trim="sessionEditDraft[s.id].locationAddress"
                                class="input"
                                type="text"
                                placeholder="Location address"
                              />
                              <select v-model="sessionEditDraft[s.id].modality" class="input">
                                <option value="">Modality…</option>
                                <option value="in_person">In person</option>
                                <option value="virtual">Virtual</option>
                                <option value="hybrid">Hybrid</option>
                              </select>
                              <input
                                v-model.trim="sessionEditDraft[s.id].joinUrl"
                                class="input"
                                type="url"
                                placeholder="Join URL (optional)"
                              />
                              <button
                                type="button"
                                class="btn btn-secondary btn-sm"
                                :disabled="sessionEditSavingId === s.id"
                                @click="saveSessionInlineEdits(s.id)"
                              >
                                {{ sessionEditSavingId === s.id ? 'Saving…' : 'Save session' }}
                              </button>
                            </div>
                          </td>
                        </tr>
                      </template>
                    </tbody>
                  </table>
                </div>
                <p v-else-if="sessionsLoadError" class="error-box sbep-sessions-err">{{ sessionsLoadError }}</p>
                <p v-else-if="sessionsLoadAttempted" class="muted">{{ scheduleEmptyMessage }}</p>
                <p v-else class="muted">No materialized sessions in range.</p>

                <div v-if="staffingEnabled && staffingSessions.length" class="sbep-schedule-day-card">
                  <div class="sbep-schedule-day-head">
                    <div>
                      <p class="sbep-subh">Day staffing, groups &amp; confirmations</p>
                      <p class="muted small sbep-card-lead">
                        Pick a date to see assigned providers, group totals, participants, and confirmation status.
                      </p>
                    </div>
                    <select v-model.number="staffingActiveSessionDateId" class="input sbep-schedule-day-select">
                      <option v-for="s in staffingSessions" :key="`sch-day-${s.sessionDateId}`" :value="Number(s.sessionDateId)">
                        {{ formatSessionDateDisplay(s.sessionDate) }}
                      </option>
                    </select>
                  </div>

                  <div v-if="staffingSummaryLoading || staffingSessionGroupsLoading || staffingSessionAssignmentsLoading || scheduleParticipantsLoading" class="muted small">
                    Loading day details…
                  </div>
                  <p v-else-if="staffingSummaryError || staffingSessionGroupsError || staffingSessionAssignmentsError || scheduleParticipantsError" class="error-box sbep-add-client-err">
                    {{ staffingSummaryError || staffingSessionGroupsError || staffingSessionAssignmentsError || scheduleParticipantsError }}
                  </p>
                  <template v-else-if="scheduleSelectedSession">
                    <div class="sbep-day-stat-grid">
                      <div class="sbep-day-stat">
                        <span>Required providers</span>
                        <strong>{{ scheduleSelectedSession.requiredProviders ?? 0 }}</strong>
                      </div>
                      <div class="sbep-day-stat">
                        <span>Assigned providers</span>
                        <strong>{{ scheduleSelectedSession.approvedProvidersCount ?? 0 }}</strong>
                      </div>
                      <div class="sbep-day-stat">
                        <span>Groups</span>
                        <strong>{{ scheduleSelectedSession.groupCount ?? 0 }}</strong>
                      </div>
                      <div class="sbep-day-stat">
                        <span>Participants</span>
                        <strong>{{ scheduleParticipants.length }}</strong>
                      </div>
                    </div>
                    <div class="sbep-day-provider-list">
                      <strong>Assigned providers:</strong>
                      <span v-if="(scheduleSelectedSession.approvedProviders || []).length">
                        {{ providerListNames(scheduleSelectedSession.approvedProviders) }}
                      </span>
                      <span v-else class="muted small">None assigned yet.</span>
                    </div>
                    <div class="sbep-day-groups-grid">
                      <div
                        v-for="group in scheduleParticipantGroupCards"
                        :key="group.key"
                        class="sbep-day-group-card"
                      >
                        <div class="sbep-day-group-title">
                          <strong>{{ group.label }}</strong>
                          <span>{{ group.participants.length }}</span>
                        </div>
                        <ul v-if="group.participants.length" class="sbep-day-participant-list">
                          <li v-for="p in group.participants" :key="`day-p-${group.key}-${p.clientId}`">
                            <span>{{ p.fullName || p.initials || p.identifierCode || `Client ${p.clientId}` }}</span>
                            <em :class="`is-${p.confirmationStatus || 'pending'}`">{{ participantConfirmationLabel(p) }}</em>
                          </li>
                        </ul>
                        <p v-else class="muted small">No participants assigned to this group.</p>
                      </div>
                    </div>
                  </template>
                </div>
              </div>

              <div v-if="detail.skillsGroup && eventBillingAgencyId && eventId" class="sbep-sched-block">
                <p class="sbep-subh">Session curriculum (PDFs)</p>
                <p class="muted small sbep-card-lead">
                  Program library PDFs attach per session — same tools as <strong>Materials</strong>. Open Materials to
                  upload to the shared program library, attach from the library, or upload directly to a session row.
                </p>
                <button type="button" class="btn btn-primary btn-sm" @click="selectRailSection('materials')">
                  Open Materials &amp; PDFs
                </button>
              </div>

              <div v-if="sessions.length && detail.event?.virtualSessionsEnabled !== false" class="sbep-sched-block">
                <p class="sbep-subh">Join links (virtual / hybrid)</p>
                <p class="muted small sbep-card-lead">Join opens 10 minutes before start and stays available through the scheduled end.</p>
                <div class="sbep-inline-actions" style="margin-bottom:8px;">
                  <router-link
                    v-if="viewerCaps.canManageCompanyEvent"
                    class="btn btn-secondary btn-sm"
                    :to="classBuilderHref"
                  >
                    Open class builder
                  </router-link>
                  <router-link
                    class="btn btn-primary btn-sm"
                    :to="classPresentationHref"
                  >
                    Open class dashboard
                  </router-link>
                  <button
                    v-if="viewerCaps.canManageCompanyEvent"
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="virtualRoomsGenerating"
                    @click="generateVirtualRoomsForSessions"
                  >
                    {{ virtualRoomsGenerating ? 'Generating rooms…' : 'Generate virtual rooms for all sessions' }}
                  </button>
                </div>
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
              v-if="(detail.providers || []).length || viewerCaps.canManageCompanyEvent"
              v-show="railActive === 'providers'"
              rail-mode
              section-id="providers"
              title="Providers"
              icon-url=""
              :badge="`${detail.providers?.length || 0} on roster`"
            >
              <p class="muted small sbep-card-lead">
                Assigned providers — profile and photo from your agency directory (same kind of info as the school portal;
                no scheduling details here).
              </p>
              <SkillBuildersEventProvidersGrid v-if="(detail.providers || []).length" :providers="detail.providers || []" />
              <p v-else class="muted small">
                No provider roster is linked yet for this event type. If this class needs staffed provider assignment
                tools, link it to a learning/skills-group-backed program event.
              </p>
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-if="detail.skillsGroup && ((detail.clients || []).length || viewerCaps.canManageCompanyEvent)"
              v-show="railActive === 'clients'"
              rail-mode
              section-id="clients"
              title="Client Management"
              icon-url=""
              :badge="`${detail.clients?.length || 0}`"
            >
              <p class="muted small sbep-card-lead">
                Clients on this program roster — mark attendance here. H2014 session notes and copy-aid notes live under
                <strong>Clinical Aid</strong> (same list style as the program hub Notes tab).
              </p>

              <!-- Coordinator: add client to roster inline -->
              <div v-if="canEnrollEventClients && detail.skillsGroup" class="sbep-add-client-block">
                <p class="sbep-subh">Add client to roster</p>
                <div class="sbep-add-client-row">
                  <input
                    v-model="rosterAddQuery"
                    type="text"
                    class="input sbep-add-client-input"
                    placeholder="Search by name or identifier…"
                    @input="scheduleRosterSearch"
                  />
                  <span v-if="rosterAddSearching" class="muted small"> Searching…</span>
                </div>
                <p v-if="rosterAddError" class="error-box sbep-add-client-err">{{ rosterAddError }}</p>
                <p v-if="rosterAddSuccess" class="sbep-flash-ok" role="status">{{ rosterAddSuccess }}</p>
                <ul v-if="rosterAddResults.length" class="sbep-add-client-results">
                  <li
                    v-for="c in rosterAddResults"
                    :key="`rac-${c.clientId}`"
                    class="sbep-add-client-result-row"
                  >
                    <span class="sbep-add-client-label">{{ c.initials || c.identifierCode || `Client ${c.clientId}` }}</span>
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      :disabled="rosterAddSavingId === c.clientId"
                      @click="addClientToRoster(c)"
                    >
                      {{ rosterAddSavingId === c.clientId ? 'Adding…' : 'Add' }}
                    </button>
                  </li>
                </ul>
                <p v-else-if="rosterAddSearched && !rosterAddResults.length && rosterAddQuery.trim()" class="muted small">
                  No clients found. Make sure the client is in the master clients list first.
                </p>
              </div>

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
                    <label
                      v-for="c in detail.clients || []"
                      :key="`ca-c-${c.id}`"
                      class="sbep-client-att-row"
                      :class="{ 'sbep-client-att-row--mine': isMyRosterClient(c) }"
                    >
                      <input v-model="clientAttSelectedClientIds" type="checkbox" :value="Number(c.id)" />
                      <span>{{ clientLabelForRow(c) }}</span>
                      <span
                        v-if="isMyRosterClient(c)"
                        class="sbep-mine-badge"
                        title="Assigned to you for intake / treatment plan"
                      >Mine</span>
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
                <p class="muted small sbep-roster-mine-legend">
                  Clients highlighted below are assigned to you for intake &amp; treatment plan readiness.
                </p>
                <div class="sbep-roster-table-wrap">
                  <table class="sbep-roster-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Assigned to</th>
                        <th>Workflow</th>
                        <th>Docs</th>
                        <th>Attendance</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="c in detail.clients || []"
                        :key="`rs-${c.id}`"
                        :class="{ 'sbep-row-mine': isMyRosterClient(c) }"
                      >
                        <td>
                          <router-link
                            v-if="rosterClientLinkTo(c)"
                            :to="rosterClientLinkTo(c)"
                            class="sbep-roster-client-link"
                          >
                            {{ clientLabelForRow(c) }}
                          </router-link>
                          <template v-else>{{ clientLabelForRow(c) }}</template>
                          <span
                            v-if="isMyRosterClient(c)"
                            class="sbep-mine-badge"
                            title="Assigned to you for intake / treatment plan"
                          >Mine</span>
                        </td>
                        <td class="muted small">
                          <span v-if="isMyRosterClient(c)" class="sbep-roster-assigned-mine">You</span>
                          <span v-else-if="c.assignedProviderName">{{ c.assignedProviderName }}</span>
                          <span v-else class="sbep-roster-missing">Unassigned</span>
                        </td>
                        <td class="muted small">
                          <span
                            class="sbep-workflow-chip"
                            :class="c.intakeComplete ? 'sbep-workflow-chip--ok' : 'sbep-workflow-chip--pending'"
                            :title="c.intakeComplete ? 'Intake complete' : 'Intake pending'"
                          >
                            Intake {{ c.intakeComplete ? '✓' : '•' }}
                          </span>
                          <span
                            class="sbep-workflow-chip"
                            :class="c.treatmentPlanComplete ? 'sbep-workflow-chip--ok' : 'sbep-workflow-chip--pending'"
                            :title="c.treatmentPlanComplete ? 'Treatment plan complete' : 'Treatment plan pending'"
                          >
                            TP {{ c.treatmentPlanComplete ? '✓' : '•' }}
                          </span>
                        </td>
                        <td class="sbep-roster-docs">
                          {{ c.paperworkStatusLabel || c.documentStatus || '—' }}
                        </td>
                        <td class="sbep-roster-att muted small">
                          <template v-if="attendanceRowsForClient(c.id).length">
                            <div v-for="row in attendanceRowsForClient(c.id)" :key="`att-${row.sessionId}-${row.clientId}`">
                              {{ formatSessionDateDisplay(row.sessionDate) }}
                              <span v-if="row.missedAt && !row.checkInAt"> · Missed</span>
                              <template v-else>
                                <span v-if="row.checkInAt"> · In {{ formatPostTime(row.checkInAt) }}</span>
                                <span v-if="row.checkOutAt"> · Out {{ formatPostTime(row.checkOutAt) }}</span>
                                <span v-if="row.checkOutAuto && row.checkOutAt" class="muted"> (auto)</span>
                              </template>
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
              v-if="canViewParticipantsTab"
              v-show="railActive === 'participants'"
              rail-mode
              section-id="participants"
              title="Participants"
              icon-url=""
              :badge="`${participantCounts.participants}`"
            >
              <p class="muted small sbep-card-lead">
                <template v-if="canEnrollEventClients">
                  Participants enrolled in this program event. Search any agency client below to register them for this event.
                </template>
                <template v-else>
                  Participants enrolled in this program event (read-only).
                </template>
              </p>

              <div v-if="canEnrollEventClients" class="sbep-add-client-block sbep-add-client-block--prominent">
                <p class="sbep-subh">Register existing client</p>
                <p class="muted small sbep-add-client-lead">
                  Search clients already in your agency. Clients with completed documentation can be enrolled directly as participants.
                </p>
                <label v-if="!detail.skillsGroup" class="sbep-add-client-option">
                  <input v-model="rosterRegisterAsParticipant" type="checkbox" />
                  Enroll as participant (intake accepted — treatment plan can follow)
                </label>
                <div class="sbep-add-client-row">
                  <input
                    v-model="rosterAddQuery"
                    type="text"
                    class="input sbep-add-client-input"
                    placeholder="Search by name or identifier…"
                    @input="scheduleRosterSearch"
                  />
                  <span v-if="rosterAddSearching" class="muted small"> Searching…</span>
                </div>
                <p v-if="rosterAddError" class="error-box sbep-add-client-err">{{ rosterAddError }}</p>
                <p v-if="rosterAddSuccess" class="sbep-flash-ok" role="status">{{ rosterAddSuccess }}</p>
                <ul v-if="rosterAddResults.length" class="sbep-add-client-results">
                  <li
                    v-for="c in rosterAddResults"
                    :key="`rac-gp-${c.clientId}`"
                    class="sbep-add-client-result-row"
                  >
                    <div class="sbep-add-client-result-main">
                      <span class="sbep-add-client-label">{{ rosterClientLabel(c) }}</span>
                      <span v-if="c.identifierCode" class="muted small">{{ c.identifierCode }}</span>
                      <span v-if="c.readyForParticipant" class="sbep-add-client-badge sbep-add-client-badge--ready">
                        Documentation complete
                      </span>
                      <span v-else-if="c.intakeReady" class="sbep-add-client-badge">Intake complete</span>
                      <span v-if="c.programAffiliated === false" class="sbep-add-client-badge sbep-add-client-badge--muted">
                        Not yet on program
                      </span>
                    </div>
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      :disabled="rosterAddSavingId === c.clientId"
                      @click="addClientToRoster(c)"
                    >
                      {{ rosterAddButtonLabel(c) }}
                    </button>
                  </li>
                </ul>
                <p v-else-if="rosterAddSearched && !rosterAddResults.length && rosterAddQuery.trim()" class="muted small">
                  No matching clients found. Try a different name or identifier.
                </p>
              </div>

              <!-- Per-group participant breakdown — only renders when there is more
                   than one staffing group with participants in it. Lets coordinators
                   see at a glance "Morning · 4, Afternoon · 6" without scrolling. -->
              <div
                v-if="participantStatusFilter === 'participants' && participantGroupBreakdown.length > 1"
                class="sbep-group-breakdown"
                aria-label="Participants per group"
              >
                <span class="sbep-group-breakdown-label">Per group:</span>
                <span
                  v-for="g in participantGroupBreakdown"
                  :key="`pg-${g.groupId}-${g.sessionDateId || 'na'}`"
                  class="sbep-group-chip"
                  :title="g.sessionLabel ? `${g.label} · ${g.sessionLabel}` : g.label"
                >
                  <strong>{{ g.label }}</strong>
                  <span v-if="g.sessionLabel" class="sbep-group-chip-session">· {{ g.sessionLabel }}</span>
                  <span class="sbep-group-chip-count">{{ g.count }}</span>
                </span>
              </div>

              <!-- Applicants pulse card + view filter pills -->
              <div class="sbep-participant-toolbar">
                <button
                  type="button"
                  class="sbep-applicants-card"
                  :class="{ 'is-pulsing': participantCounts.registrants > 0, 'is-active': participantStatusFilter === 'registrants' }"
                  :disabled="participantStatusFilter === 'registrants'"
                  :aria-pressed="participantStatusFilter === 'registrants'"
                  @click="setParticipantStatusFilter('registrants')"
                >
                  <span class="sbep-applicants-count">{{ participantCounts.registrants }}</span>
                  <span class="sbep-applicants-label">
                    {{ participantCounts.registrants === 1 ? 'Active applicant' : 'Active applicants' }}
                  </span>
                  <span class="sbep-applicants-help">Awaiting intake acceptance — view registrants →</span>
                </button>

                <div class="sbep-status-filter" role="tablist" aria-label="Filter by workflow status">
                  <button
                    type="button"
                    role="tab"
                    class="sbep-status-pill"
                    :class="{ 'is-active': participantStatusFilter === 'registrants' }"
                    :aria-selected="participantStatusFilter === 'registrants'"
                    @click="setParticipantStatusFilter('registrants')"
                  >
                    Registrants
                    <span
                      class="sbep-status-pill-count"
                      :class="{ 'is-pulsing': participantCounts.registrants > 0 && participantStatusFilter !== 'registrants' }"
                    >{{ participantCounts.registrants }}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    class="sbep-status-pill"
                    :class="{ 'is-active': participantStatusFilter === 'participants' }"
                    :aria-selected="participantStatusFilter === 'participants'"
                    @click="setParticipantStatusFilter('participants')"
                  >
                    Participants
                    <span class="sbep-status-pill-count">{{ participantCounts.participants }}</span>
                  </button>
                  <span
                    v-if="participantCounts.denied > 0"
                    class="sbep-status-pill sbep-status-pill--denied"
                    role="note"
                    title="Denied intakes appear in the registrants list (greyed out) but are excluded from every count."
                  >
                    Denied
                    <span class="sbep-status-pill-count">{{ participantCounts.denied }}</span>
                  </span>
                </div>
              </div>

              <p
                v-if="participantStatusFilter === 'registrants'"
                class="muted small sbep-status-hint"
              >
                Showing <strong>registrants</strong> — clients still moving through intake (provider assignment and accept/deny).
                Once intake is <strong>Accepted</strong>, they also appear under
                <strong>Participants</strong> and stay here until the treatment plan is complete.
              </p>
              <p
                v-else-if="participantStatusFilter === 'participants'"
                class="muted small sbep-status-hint"
              >
                Showing <strong>participants</strong> — clients whose intake was accepted.
                Rows highlighted in yellow still need a treatment plan; they can be staffed and grouped while that is completed.
              </p>

              <p v-if="genericParticipantsLoading" class="muted small">Loading participants…</p>
              <p v-else-if="genericParticipantsError" class="error-box sbep-add-client-err">{{ genericParticipantsError }}</p>
              <div v-else-if="genericParticipants.length" class="sbep-roster-summary-block">
                <p class="sbep-subh sbep-roster-summary-heading">
                  {{ participantStatusFilter === 'participants' ? 'Enrolled participants' : 'Roster' }}
                </p>
                <div class="sbep-participant-summary-table sbep-roster-table-wrap" style="margin-bottom: 14px;">
                  <table class="sbep-roster-table sbep-roster-table--participants">
                    <thead>
                      <tr>
                        <th>Participant</th>
                        <th>Age</th>
                        <th>Grade</th>
                        <th>Group</th>
                        <th v-if="!viewerCaps.canManageCompanyEvent">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="c in genericParticipants" :key="`psum-${c.clientId}`">
                        <td>{{ c.fullName || c.initials || c.identifierCode || `Client ${c.clientId}` }}</td>
                        <td>{{ participantAgeDisplay(c) }}</td>
                        <td>{{ c.grade || '—' }}</td>
                        <td>{{ participantGroupDisplay(c) }}</td>
                        <td v-if="!viewerCaps.canManageCompanyEvent">{{ participantStatusLabel(c) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <template v-if="viewerCaps.canManageCompanyEvent">
                <p v-if="participantProvidersError" class="error-box sbep-add-client-err">{{ participantProvidersError }}</p>
                <div v-if="staffingEnabled" class="sbep-staffing-wrap">
                  <div class="sbep-staffing-top">
                    <div class="form-group sbep-staffing-session">
                      <label class="sbep-subh">Session</label>
                      <select v-model.number="staffingActiveSessionDateId" class="input">
                        <option :value="0">Select a session…</option>
                        <option v-for="s in staffingSessions" :key="`ss-${s.sessionDateId}`" :value="Number(s.sessionDateId)">
                          {{ formatSessionDateDisplay(s.sessionDate) }}
                          <template v-if="s.startsAt"> · {{ String(s.startsAt).slice(11, 16) }}</template>
                          <template v-if="s.endsAt">–{{ String(s.endsAt).slice(11, 16) }}</template>
                        </option>
                      </select>
                    </div>
                    <div class="sbep-staffing-meta">
                      <div v-if="staffingSummaryLoading" class="muted small">Loading staffing…</div>
                      <div v-else-if="staffingSummaryError" class="error-box sbep-add-client-err">{{ staffingSummaryError }}</div>
                      <div v-else-if="staffingActiveSession" class="muted small">
                        <strong>Required:</strong> {{ staffingActiveSession.requiredProviders }}
                        · <strong>Approved:</strong> {{ staffingActiveSession.approvedProvidersCount }}
                        · <strong>Confirmed:</strong> {{ staffingActiveSession.confirmedClientsCount }}
                        · <strong>Groups:</strong> {{ staffingActiveSession.groupCount }}
                      </div>
                      <div class="sbep-staffing-actions">
                        <button type="button" class="btn btn-secondary btn-sm" @click="refreshStaffingForActiveSession">
                          Refresh staffing
                        </button>
                      </div>
                    </div>
                  </div>

                  <div v-if="!staffingActiveSessionDateId" class="muted small">Select a session to view groups and staffing.</div>
                  <div v-else class="sbep-staffing-layout">
                    <div class="sbep-staffing-main">
                      <div v-if="staffingSessionGroupsError" class="error-box sbep-add-client-err">
                        {{ staffingSessionGroupsError }}
                      </div>
                      <div v-if="staffingSessionAssignmentsError" class="error-box sbep-add-client-err">
                        {{ staffingSessionAssignmentsError }}
                      </div>
                      <div v-if="staffingSessionGroupsLoading || staffingSessionAssignmentsLoading" class="muted small">
                        Loading groups…
                      </div>

                      <div v-else>
                        <div class="sbep-group-create">
                          <div>
                            <p class="sbep-subh">Create participant group</p>
                            <p class="muted small sbep-card-lead">Add a group for this session, then assign participants from the Group column.</p>
                          </div>
                          <div class="sbep-group-create-row">
                            <input
                              v-model.trim="staffingNewGroupLabel"
                              class="input"
                              type="text"
                              placeholder="e.g. Group A, Morning, Room 1"
                              :disabled="staffingNewGroupSaving"
                              @keyup.enter="createStaffingSessionGroup"
                            />
                            <button
                              type="button"
                              class="btn btn-secondary btn-sm"
                              :disabled="staffingNewGroupSaving || !staffingNewGroupLabel.trim()"
                              @click="createStaffingSessionGroup"
                            >
                              {{ staffingNewGroupSaving ? 'Adding…' : 'Add group' }}
                            </button>
                          </div>
                          <p v-if="staffingNewGroupError" class="error-box sbep-add-client-err">{{ staffingNewGroupError }}</p>
                        </div>

                        <div class="sbep-group-block">
                          <p class="sbep-subh">Unassigned</p>
                          <p class="muted small sbep-card-lead">Participants not yet assigned to a session group.</p>
                          <div class="sbep-roster-table-wrap" v-if="staffingParticipantGroups.unassigned.length">
                            <table class="sbep-roster-table sbep-roster-table--participants">
                              <thead>
                                <tr>
                                  <th>Participant</th>
                                  <th>Grade</th>
                                  <th>Age</th>
                                  <th>Group</th>
                                  <th>Intake</th>
                                  <th>Treatment plan</th>
                                  <th>Confirm</th>
                                  <th>Provider</th>
                                  <th>Notes</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr
                                  v-for="c in staffingParticipantGroups.unassigned"
                                  :key="`gp-un-${c.clientId}`"
                                  :class="{ 'sbep-row-mine': isMyParticipant(c), 'sbep-row-tp-pending': isParticipantTpPending(c) }"
                                >
                                  <td>
                                    <router-link
                                      v-if="rosterClientLinkTo({ id: c.clientId })"
                                      :to="rosterClientLinkTo({ id: c.clientId })"
                                      class="sbep-roster-client-link"
                                    >
                                      {{ c.fullName || c.initials || c.identifierCode || `Client ${c.clientId}` }}
                                    </router-link>
                                    <template v-else>{{ c.fullName || c.initials || c.identifierCode || `Client ${c.clientId}` }}</template>
                                    <span v-if="isParticipantTpPending(c)" class="sbep-tp-due-badge">Treatment plan due</span>
                                  </td>
                                  <td>{{ c.grade || '—' }}</td>
                                  <td>{{ participantAgeDisplay(c) }}</td>
                                  <td style="min-width: 220px;">
                                    <select
                                      class="input sbep-provider-select"
                                      :value="participantGroupId(c.clientId) ? String(participantGroupId(c.clientId)) : ''"
                                      @change="assignParticipantToGroup(c, $event.target.value)"
                                    >
                                      <option value="">Unassigned</option>
                                      <option v-for="g in staffingSessionGroups" :key="`gopt-${g.id}`" :value="String(g.id)">
                                        {{ groupDisplayLabel(g) }}
                                      </option>
                                    </select>
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      class="sbep-workflow-btn"
                                      :class="{ 'is-complete': c.intakeComplete }"
                                      :disabled="participantWorkflowSavingClientId === c.clientId"
                                      :title="formatWorkflowTooltip(c.intakeComplete ? 'Intake complete' : 'Intake needed', c.intakeCompletedAt, c.intakeCompletedByName)"
                                      @click="toggleParticipantIntake(c)"
                                    >
                                      {{ c.intakeComplete ? 'Complete' : 'Needed' }}
                                    </button>
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      class="sbep-workflow-btn"
                                      :class="{ 'is-complete': c.treatmentPlanComplete }"
                                      :disabled="participantWorkflowSavingClientId === c.clientId || (!c.intakeComplete && !c.treatmentPlanComplete)"
                                      :title="formatWorkflowTooltip(c.treatmentPlanComplete ? 'Treatment plan complete' : 'Treatment plan needed', c.treatmentPlanCompletedAt, c.treatmentPlanCompletedByName)"
                                      @click="toggleParticipantTreatmentPlan(c)"
                                    >
                                      {{ c.treatmentPlanComplete ? 'Complete' : 'Needed' }}
                                    </button>
                                  </td>
                                  <td>
                                    <button type="button" class="sbep-confirm-pill" disabled>
                                      {{ c.treatmentPlanComplete ? 'Confirmed' : 'Confirm' }}
                                    </button>
                                  </td>
                                  <td style="min-width: 220px;">
                                    <select
                                      class="input sbep-provider-select"
                                      :disabled="participantWorkflowSavingClientId === c.clientId || participantProvidersLoading"
                                      :value="c.assignedProviderUserId ? String(c.assignedProviderUserId) : ''"
                                      @change="changeParticipantProvider(c, $event.target.value)"
                                    >
                                      <option value="">Unassigned</option>
                                      <option v-for="p in participantProviders" :key="`prov-un-${p.id}`" :value="String(p.id)">
                                        {{ p.name }}
                                      </option>
                                    </select>
                                  </td>
                                  <td style="min-width: 240px;">
                                    <input
                                      v-model.trim="c.notes"
                                      class="input"
                                      type="text"
                                      placeholder="Optional…"
                                      :disabled="participantNotesSavingClientId === c.clientId"
                                      @blur="saveParticipantNotes(c)"
                                    />
                                  </td>
                                  <td class="sbep-roster-actions">
                                    <div class="sbep-row-action-stack">
                                      <button
                                        type="button"
                                        class="btn btn-primary btn-sm sbep-row-save-btn"
                                        :disabled="participantWorkflowSavingClientId === c.clientId || participantNotesSavingClientId === c.clientId"
                                        @click="saveParticipantRow(c)"
                                      >
                                        Save
                                      </button>
                                      <span
                                        v-if="participantRowSaveStatus[c.clientId]"
                                        class="sbep-row-save-status"
                                        :class="`is-${participantRowSaveStatus[c.clientId].state}`"
                                        :title="participantRowSaveStatus[c.clientId].message || ''"
                                      >
                                        <template v-if="participantRowSaveStatus[c.clientId].state === 'saving'">Saving…</template>
                                        <template v-else-if="participantRowSaveStatus[c.clientId].state === 'saved'">Saved ✓</template>
                                        <template v-else-if="participantRowSaveStatus[c.clientId].state === 'error'">Error</template>
                                      </span>
                                      <button type="button" class="btn btn-link btn-sm sbep-row-remove-btn" @click="removeGenericParticipant(c)">Remove</button>
                                    </div>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                          <p v-else class="muted small">No unassigned participants.</p>
                        </div>

                        <div v-for="g in staffingParticipantGroups.byGroup" :key="`grp-${g.id}`" class="sbep-group-block">
                          <p class="sbep-subh">{{ groupDisplayLabel(g) }}</p>
                          <div class="sbep-roster-table-wrap" v-if="g.participants.length">
                            <table class="sbep-roster-table sbep-roster-table--participants">
                              <thead>
                                <tr>
                                  <th>Participant</th>
                                  <th>Grade</th>
                                  <th>Age</th>
                                  <th>Group</th>
                                  <th>Intake</th>
                                  <th>Treatment plan</th>
                                  <th>Confirm</th>
                                  <th>Provider</th>
                                  <th>Notes</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr
                                  v-for="c in g.participants"
                                  :key="`gp-g-${g.id}-${c.clientId}`"
                                  :class="{ 'sbep-row-mine': isMyParticipant(c), 'sbep-row-tp-pending': isParticipantTpPending(c) }"
                                >
                                  <td>
                                    <router-link
                                      v-if="rosterClientLinkTo({ id: c.clientId })"
                                      :to="rosterClientLinkTo({ id: c.clientId })"
                                      class="sbep-roster-client-link"
                                    >
                                      {{ c.fullName || c.initials || c.identifierCode || `Client ${c.clientId}` }}
                                    </router-link>
                                    <template v-else>{{ c.fullName || c.initials || c.identifierCode || `Client ${c.clientId}` }}</template>
                                    <span v-if="isParticipantTpPending(c)" class="sbep-tp-due-badge">Treatment plan due</span>
                                  </td>
                                  <td>{{ c.grade || '—' }}</td>
                                  <td>{{ participantAgeDisplay(c) }}</td>
                                  <td style="min-width: 220px;">
                                    <select
                                      class="input sbep-provider-select"
                                      :value="participantGroupId(c.clientId) ? String(participantGroupId(c.clientId)) : ''"
                                      @change="assignParticipantToGroup(c, $event.target.value)"
                                    >
                                      <option value="">Unassigned</option>
                                      <option v-for="opt in staffingSessionGroups" :key="`gopt2-${opt.id}`" :value="String(opt.id)">
                                        {{ groupDisplayLabel(opt) }}
                                      </option>
                                    </select>
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      class="sbep-workflow-btn"
                                      :class="{ 'is-complete': c.intakeComplete }"
                                      :disabled="participantWorkflowSavingClientId === c.clientId"
                                      :title="formatWorkflowTooltip(c.intakeComplete ? 'Intake complete' : 'Intake needed', c.intakeCompletedAt, c.intakeCompletedByName)"
                                      @click="toggleParticipantIntake(c)"
                                    >
                                      {{ c.intakeComplete ? 'Complete' : 'Needed' }}
                                    </button>
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      class="sbep-workflow-btn"
                                      :class="{ 'is-complete': c.treatmentPlanComplete }"
                                      :disabled="participantWorkflowSavingClientId === c.clientId || (!c.intakeComplete && !c.treatmentPlanComplete)"
                                      :title="formatWorkflowTooltip(c.treatmentPlanComplete ? 'Treatment plan complete' : 'Treatment plan needed', c.treatmentPlanCompletedAt, c.treatmentPlanCompletedByName)"
                                      @click="toggleParticipantTreatmentPlan(c)"
                                    >
                                      {{ c.treatmentPlanComplete ? 'Complete' : 'Needed' }}
                                    </button>
                                  </td>
                                  <td>
                                    <button type="button" class="sbep-confirm-pill" disabled>
                                      {{ c.treatmentPlanComplete ? 'Confirmed' : 'Confirm' }}
                                    </button>
                                  </td>
                                  <td style="min-width: 220px;">
                                    <select
                                      class="input sbep-provider-select"
                                      :disabled="participantWorkflowSavingClientId === c.clientId || participantProvidersLoading"
                                      :value="c.assignedProviderUserId ? String(c.assignedProviderUserId) : ''"
                                      @change="changeParticipantProvider(c, $event.target.value)"
                                    >
                                      <option value="">Unassigned</option>
                                      <option v-for="p in participantProviders" :key="`prov-g-${g.id}-${p.id}`" :value="String(p.id)">
                                        {{ p.name }}
                                      </option>
                                    </select>
                                  </td>
                                  <td style="min-width: 240px;">
                                    <input
                                      v-model.trim="c.notes"
                                      class="input"
                                      type="text"
                                      placeholder="Optional…"
                                      :disabled="participantNotesSavingClientId === c.clientId"
                                      @blur="saveParticipantNotes(c)"
                                    />
                                  </td>
                                  <td class="sbep-roster-actions">
                                    <div class="sbep-row-action-stack">
                                      <button
                                        type="button"
                                        class="btn btn-primary btn-sm sbep-row-save-btn"
                                        :disabled="participantWorkflowSavingClientId === c.clientId || participantNotesSavingClientId === c.clientId"
                                        @click="saveParticipantRow(c)"
                                      >
                                        Save
                                      </button>
                                      <span
                                        v-if="participantRowSaveStatus[c.clientId]"
                                        class="sbep-row-save-status"
                                        :class="`is-${participantRowSaveStatus[c.clientId].state}`"
                                        :title="participantRowSaveStatus[c.clientId].message || ''"
                                      >
                                        <template v-if="participantRowSaveStatus[c.clientId].state === 'saving'">Saving…</template>
                                        <template v-else-if="participantRowSaveStatus[c.clientId].state === 'saved'">Saved ✓</template>
                                        <template v-else-if="participantRowSaveStatus[c.clientId].state === 'error'">Error</template>
                                      </span>
                                      <button type="button" class="btn btn-link btn-sm sbep-row-remove-btn" @click="removeGenericParticipant(c)">Remove</button>
                                    </div>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                          <p v-else class="muted small">No participants assigned to this group.</p>
                        </div>
                      </div>
                    </div>

                    <aside class="sbep-staffing-side">
                      <p class="sbep-subh">Staffing</p>
                      <div v-if="staffingSessionRequestsError" class="error-box sbep-add-client-err">
                        {{ staffingSessionRequestsError }}
                      </div>
                      <div v-if="staffingSessionRequestsLoading" class="muted small">Loading requests…</div>
                      <template v-else>
                        <div class="sbep-staffing-card">
                          <p class="muted small" style="margin: 0;">
                            <strong>Required:</strong> {{ staffingActiveSession?.requiredProviders ?? 0 }}<br />
                            <strong>Approved:</strong> {{ staffingActiveSession?.approvedProvidersCount ?? 0 }}<br />
                            <strong>Pending:</strong> {{ (staffingSessionRequests || []).filter((r) => r.status === 'pending').length }}
                          </p>
                        </div>

                        <div class="sbep-staffing-card">
                          <p class="sbep-subh">Pending requests</p>
                          <div v-if="!(staffingSessionRequests || []).some((r) => r.status === 'pending')" class="muted small">
                            No pending requests.
                          </div>
                          <div
                            v-for="r in (staffingSessionRequests || []).filter((x) => x.status === 'pending')"
                            :key="`req-${r.id}`"
                            class="sbep-req-row"
                          >
                            <div class="sbep-req-meta">
                              <div class="sbep-req-name">{{ r.providerName }}</div>
                              <div class="muted small">{{ r.requestType }}</div>
                            </div>
                            <div class="sbep-req-actions">
                              <button
                                type="button"
                                class="btn btn-primary btn-sm"
                                :disabled="staffingRequestDecisionSavingId === r.id"
                                @click="approveSessionRequest(r)"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                class="btn btn-secondary btn-sm"
                                :disabled="staffingRequestDecisionSavingId === r.id"
                                @click="denySessionRequest(r)"
                              >
                                Deny
                              </button>
                            </div>
                          </div>
                        </div>
                      </template>
                    </aside>
                  </div>
                </div>

                <div v-else-if="participantStatusFilter === 'registrants'" class="sbep-roster-table-wrap sbep-registrants-wrap">
                  <table class="sbep-roster-table sbep-roster-table--participants sbep-roster-table--registrants">
                    <thead>
                      <tr>
                        <th>Participant</th>
                        <th>Registered</th>
                        <th>Grade</th>
                        <th>Age</th>
                        <th>Group</th>
                        <th>Provider</th>
                        <th>Intake</th>
                        <th>Treatment plan</th>
                        <th>Notes</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="c in genericParticipants"
                        :key="`reg-${c.clientId}`"
                        :class="{
                          'sbep-row-mine': isMyParticipant(c),
                          'sbep-row-denied': c.intakeOutcome === 'denied',
                          'sbep-row-tp-pending': isParticipantTpPending(c)
                        }"
                      >
                        <td>
                          <router-link
                            v-if="rosterClientLinkTo({ id: c.clientId })"
                            :to="rosterClientLinkTo({ id: c.clientId })"
                            class="sbep-roster-client-link"
                          >
                            {{ c.fullName || c.initials || c.identifierCode || `Client ${c.clientId}` }}
                          </router-link>
                          <template v-else>{{ c.fullName || c.initials || c.identifierCode || `Client ${c.clientId}` }}</template>
                          <span v-if="isParticipantTpPending(c)" class="sbep-tp-due-badge">Treatment plan due</span>
                        </td>
                        <td class="sbep-registrants-date" :title="formatRegisteredTooltip(c.enrolledAt)">
                          {{ formatRegisteredDate(c.enrolledAt) }}
                        </td>
                        <td>{{ c.grade || '—' }}</td>
                        <td>{{ participantAgeDisplay(c) }}</td>
                        <td>{{ participantGroupDisplay(c) }}</td>
                        <td style="min-width: 200px;">
                          <select
                            class="input sbep-provider-select"
                            :disabled="participantWorkflowSavingClientId === c.clientId || participantProvidersLoading"
                            :value="c.assignedProviderUserId ? String(c.assignedProviderUserId) : ''"
                            @change="changeParticipantProvider(c, $event.target.value)"
                          >
                            <option value="">Unassigned</option>
                            <option v-for="p in participantProviders" :key="`reg-prov-${c.clientId}-${p.id}`" :value="String(p.id)">
                              {{ p.name }}
                            </option>
                          </select>
                        </td>
                        <td class="sbep-registrants-intake-cell">
                          <template v-if="!isIntakeAccepted(c) && c.intakeOutcome !== 'denied'">
                            <div class="sbep-registrants-intake-actions">
                              <button
                                type="button"
                                class="sbep-outcome-btn sbep-outcome-btn--accept"
                                :disabled="participantWorkflowSavingClientId === c.clientId"
                                title="Mark intake Accepted — client appears on Participants and stays here until treatment plan is complete"
                                @click="setParticipantIntakeOutcome(c, 'accepted')"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                class="sbep-outcome-btn sbep-outcome-btn--deny"
                                :disabled="participantWorkflowSavingClientId === c.clientId"
                                title="Mark intake Denied — no treatment plan will be created"
                                @click="setParticipantIntakeOutcome(c, 'denied')"
                              >
                                Deny
                              </button>
                            </div>
                            <span class="sbep-outcome-needed">Needed</span>
                          </template>
                          <template v-else>
                            <span
                              class="sbep-outcome-pill"
                              :class="`is-${c.intakeOutcome}`"
                              :title="formatWorkflowTooltip(intakeOutcomeLabel(c.intakeOutcome), c.intakeCompletedAt, c.intakeCompletedByName)"
                            >
                              {{ intakeOutcomeLabel(c.intakeOutcome) }}
                            </span>
                            <button
                              type="button"
                              class="btn btn-link btn-sm sbep-outcome-reset"
                              :disabled="participantWorkflowSavingClientId === c.clientId"
                              title="Reset intake to Needed"
                              @click="setParticipantIntakeOutcome(c, null)"
                            >
                              Reset
                            </button>
                          </template>
                        </td>
                        <td>
                          <button
                            type="button"
                            class="sbep-workflow-btn"
                            :class="{ 'is-complete': c.treatmentPlanComplete }"
                            :disabled="participantWorkflowSavingClientId === c.clientId || !isIntakeAccepted(c)"
                            :title="c.intakeOutcome === 'denied'
                              ? 'Treatment plan not applicable — intake was Denied'
                              : !isIntakeAccepted(c)
                                ? 'Accept intake first to enable treatment plan'
                                : formatWorkflowTooltip(c.treatmentPlanComplete ? 'Treatment plan complete' : 'Treatment plan needed', c.treatmentPlanCompletedAt, c.treatmentPlanCompletedByName)"
                            @click="toggleParticipantTreatmentPlan(c)"
                          >
                            <template v-if="c.intakeOutcome === 'denied'">N/A</template>
                            <template v-else-if="!isIntakeAccepted(c)">Locked</template>
                            <template v-else-if="c.treatmentPlanComplete">Complete</template>
                            <template v-else>Needed</template>
                          </button>
                        </td>
                        <td style="min-width: 220px;">
                          <input
                            v-model.trim="c.notes"
                            class="input"
                            type="text"
                            placeholder="Optional…"
                            :disabled="participantNotesSavingClientId === c.clientId"
                            @blur="saveParticipantNotes(c)"
                          />
                        </td>
                        <td class="sbep-roster-actions">
                          <div class="sbep-row-action-stack">
                            <button
                              type="button"
                              class="btn btn-primary btn-sm sbep-row-save-btn"
                              :disabled="participantWorkflowSavingClientId === c.clientId || participantNotesSavingClientId === c.clientId"
                              @click="saveParticipantRow(c)"
                            >
                              Save
                            </button>
                            <span
                              v-if="participantRowSaveStatus[c.clientId]"
                              class="sbep-row-save-status"
                              :class="`is-${participantRowSaveStatus[c.clientId].state}`"
                              :title="participantRowSaveStatus[c.clientId].message || ''"
                            >
                              <template v-if="participantRowSaveStatus[c.clientId].state === 'saving'">Saving…</template>
                              <template v-else-if="participantRowSaveStatus[c.clientId].state === 'saved'">Saved ✓</template>
                              <template v-else-if="participantRowSaveStatus[c.clientId].state === 'error'">Error</template>
                            </span>
                            <button type="button" class="btn btn-link btn-sm sbep-row-remove-btn" @click="removeGenericParticipant(c)">Remove</button>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div v-else-if="participantStatusFilter === 'participants'" class="sbep-roster-table-wrap sbep-participants-wrap">
                  <table class="sbep-roster-table sbep-roster-table--participants sbep-roster-table--graduated">
                    <thead>
                      <tr>
                        <th>Participant</th>
                        <th>Age</th>
                        <th>Grade</th>
                        <th>Group</th>
                        <th class="sbep-flag-th" title="Eloping risk reported on intake">
                          <span aria-hidden="true">🚸</span> Eloping
                        </th>
                        <th class="sbep-flag-th" title="Extra support requested on intake">
                          <span aria-hidden="true">🤝</span> Support
                        </th>
                        <th>Comments</th>
                        <th>Confirmed</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="c in genericParticipants"
                        :key="`part-${c.clientId}`"
                        :class="{ 'sbep-row-mine': isMyParticipant(c), 'sbep-row-tp-pending': isParticipantTpPending(c) }"
                      >
                        <td>
                          <router-link
                            v-if="rosterClientLinkTo({ id: c.clientId })"
                            :to="rosterClientLinkTo({ id: c.clientId })"
                            class="sbep-roster-client-link"
                          >
                            {{ c.fullName || c.initials || c.identifierCode || `Client ${c.clientId}` }}
                          </router-link>
                          <template v-else>{{ c.fullName || c.initials || c.identifierCode || `Client ${c.clientId}` }}</template>
                          <span v-if="isParticipantTpPending(c)" class="sbep-tp-due-badge">Treatment plan due</span>
                        </td>
                        <td>{{ participantAgeDisplay(c) }}</td>
                        <td>{{ c.grade || '—' }}</td>
                        <td>{{ participantGroupDisplay(c) }}</td>
                        <td class="sbep-flag-cell">
                          <button
                            v-if="c.elopingFlag"
                            type="button"
                            class="sbep-safety-chip sbep-safety-chip--eloping"
                            :class="{ 'is-readonly': !isAdminViewer }"
                            :disabled="!isAdminViewer || participantWorkflowSavingClientId === c.clientId"
                            :title="isAdminViewer
                              ? `Click to remove (admin override)${c.elopingNotes ? ' — Notes: ' + c.elopingNotes : ''}`
                              : `Eloping risk from intake${c.elopingNotes ? ' — Notes: ' + c.elopingNotes : ''}. Only an admin can de-select.`"
                            @click="setParticipantSafetyFlag(c, 'elopingFlag', null)"
                          >
                            <span aria-hidden="true">✓</span> Yes
                          </button>
                          <span v-else class="sbep-flag-empty" aria-label="Not flagged">—</span>
                        </td>
                        <td class="sbep-flag-cell">
                          <button
                            v-if="c.extraAssistanceFlag"
                            type="button"
                            class="sbep-safety-chip sbep-safety-chip--support"
                            :class="{ 'is-readonly': !isAdminViewer }"
                            :disabled="!isAdminViewer || participantWorkflowSavingClientId === c.clientId"
                            :title="isAdminViewer
                              ? `Click to remove (admin override)${c.extraAssistanceNotes ? ' — Notes: ' + c.extraAssistanceNotes : ''}`
                              : `Extra support requested on intake${c.extraAssistanceNotes ? ' — Notes: ' + c.extraAssistanceNotes : ''}. Only an admin can de-select.`"
                            @click="setParticipantSafetyFlag(c, 'extraAssistanceFlag', null)"
                          >
                            <span aria-hidden="true">✓</span> Yes
                          </button>
                          <span v-else class="sbep-flag-empty" aria-label="Not flagged">—</span>
                        </td>
                        <td style="min-width: 200px;">
                          <input
                            v-model.trim="c.notes"
                            class="input"
                            type="text"
                            placeholder="Optional…"
                            :disabled="participantNotesSavingClientId === c.clientId"
                            @blur="saveParticipantNotes(c)"
                          />
                        </td>
                        <td class="sbep-confirm-cell">
                          <div class="sbep-attend-pills" role="radiogroup" aria-label="Family attendance confirmation">
                            <button
                              type="button"
                              role="radio"
                              :aria-checked="(c.confirmationStatus || 'pending') === 'yes'"
                              class="sbep-attend-pill sbep-attend-pill--yes"
                              :class="{ 'is-active': c.confirmationStatus === 'yes' }"
                              :disabled="participantWorkflowSavingClientId === c.clientId"
                              :title="formatWorkflowTooltip(
                                c.confirmationSetMethod === 'admin_override' ? 'Admin override — Yes' : 'Confirmed Yes',
                                c.confirmationSetAt,
                                c.confirmationSetByName
                              )"
                              @click="setParticipantConfirmation(c, 'yes')"
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              role="radio"
                              :aria-checked="(c.confirmationStatus || 'pending') === 'no'"
                              class="sbep-attend-pill sbep-attend-pill--no"
                              :class="{ 'is-active': c.confirmationStatus === 'no' }"
                              :disabled="participantWorkflowSavingClientId === c.clientId"
                              :title="formatWorkflowTooltip(
                                c.confirmationSetMethod === 'admin_override' ? 'Admin override — No' : 'Declined',
                                c.confirmationSetAt,
                                c.confirmationSetByName
                              )"
                              @click="setParticipantConfirmation(c, 'no')"
                            >
                              No
                            </button>
                            <button
                              type="button"
                              role="radio"
                              :aria-checked="(c.confirmationStatus || 'pending') === 'pending'"
                              class="sbep-attend-pill sbep-attend-pill--pending"
                              :class="{ 'is-active': (c.confirmationStatus || 'pending') === 'pending' }"
                              :disabled="participantWorkflowSavingClientId === c.clientId"
                              title="No reply yet — reset to pending"
                              @click="setParticipantConfirmation(c, 'pending')"
                            >
                              Pending
                            </button>
                          </div>
                          <p
                            v-if="c.confirmationSetByName && c.confirmationStatus !== 'pending'"
                            class="muted small sbep-confirm-meta"
                          >
                            <span v-if="c.confirmationSetMethod === 'admin_override'">Override · {{ c.confirmationSetByName }}</span>
                            <span v-else>{{ c.confirmationSetByName }}</span>
                          </p>
                        </td>
                        <td class="sbep-roster-actions">
                          <div class="sbep-row-action-stack">
                            <button
                              type="button"
                              class="btn btn-primary btn-sm sbep-row-save-btn"
                              :disabled="participantWorkflowSavingClientId === c.clientId || participantNotesSavingClientId === c.clientId"
                              @click="saveParticipantRow(c)"
                            >
                              Save
                            </button>
                            <span
                              v-if="participantRowSaveStatus[c.clientId]"
                              class="sbep-row-save-status"
                              :class="`is-${participantRowSaveStatus[c.clientId].state}`"
                              :title="participantRowSaveStatus[c.clientId].message || ''"
                            >
                              <template v-if="participantRowSaveStatus[c.clientId].state === 'saving'">Saving…</template>
                              <template v-else-if="participantRowSaveStatus[c.clientId].state === 'saved'">Saved ✓</template>
                              <template v-else-if="participantRowSaveStatus[c.clientId].state === 'error'">Error</template>
                            </span>
                            <button type="button" class="btn btn-link btn-sm sbep-row-remove-btn" @click="removeGenericParticipant(c)">Remove</button>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p class="muted small sbep-participants-footnote">
                    Confirmed pills are coordinator-managed today. When the
                    "We can't wait to see you — will you be attending?" SMS/email automation lands, replies
                    will set Yes/No automatically; admin overrides will continue to win and are tagged as such on hover.
                  </p>
                </div>

                <div v-else class="sbep-roster-table-wrap">
                  <table class="sbep-roster-table sbep-roster-table--participants">
                    <thead>
                      <tr>
                        <th>Participant</th>
                        <th>Grade</th>
                        <th>Age</th>
                        <th>Group</th>
                        <th>Intake</th>
                        <th>Treatment plan</th>
                        <th>Confirm</th>
                        <th>Provider</th>
                        <th>Notes</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="c in genericParticipants"
                        :key="`gp-${c.clientId}`"
                        :class="{ 'sbep-row-mine': isMyParticipant(c), 'sbep-row-tp-pending': isParticipantTpPending(c) }"
                      >
                        <td>
                          <router-link
                            v-if="rosterClientLinkTo({ id: c.clientId })"
                            :to="rosterClientLinkTo({ id: c.clientId })"
                            class="sbep-roster-client-link"
                          >
                            {{ c.fullName || c.initials || c.identifierCode || `Client ${c.clientId}` }}
                          </router-link>
                          <template v-else>{{ c.fullName || c.initials || c.identifierCode || `Client ${c.clientId}` }}</template>
                        </td>
                        <td>{{ c.grade || '—' }}</td>
                        <td>{{ participantAgeDisplay(c) }}</td>
                        <td>{{ participantGroupDisplay(c) }}</td>
                        <td>
                          <button
                            type="button"
                            class="sbep-workflow-btn"
                            :class="{ 'is-complete': c.intakeComplete }"
                            :disabled="participantWorkflowSavingClientId === c.clientId"
                            :title="formatWorkflowTooltip(c.intakeComplete ? 'Intake complete' : 'Intake needed', c.intakeCompletedAt, c.intakeCompletedByName)"
                            @click="toggleParticipantIntake(c)"
                          >
                            {{ c.intakeComplete ? 'Complete' : 'Needed' }}
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            class="sbep-workflow-btn"
                            :class="{ 'is-complete': c.treatmentPlanComplete }"
                            :disabled="participantWorkflowSavingClientId === c.clientId || (!c.intakeComplete && !c.treatmentPlanComplete)"
                            :title="formatWorkflowTooltip(c.treatmentPlanComplete ? 'Treatment plan complete' : 'Treatment plan needed', c.treatmentPlanCompletedAt, c.treatmentPlanCompletedByName)"
                            @click="toggleParticipantTreatmentPlan(c)"
                          >
                            {{ c.treatmentPlanComplete ? 'Complete' : 'Needed' }}
                          </button>
                        </td>
                        <td>
                          <button type="button" class="sbep-confirm-pill" disabled>
                            {{ c.treatmentPlanComplete ? 'Confirmed' : 'Confirm' }}
                          </button>
                        </td>
                        <td style="min-width: 220px;">
                          <select
                            class="input sbep-provider-select"
                            :disabled="participantWorkflowSavingClientId === c.clientId || participantProvidersLoading"
                            :value="c.assignedProviderUserId ? String(c.assignedProviderUserId) : ''"
                            @change="changeParticipantProvider(c, $event.target.value)"
                          >
                            <option value="">Unassigned</option>
                            <option v-for="p in participantProviders" :key="`prov-${p.id}`" :value="String(p.id)">
                              {{ p.name }}
                            </option>
                          </select>
                        </td>
                        <td style="min-width: 240px;">
                          <input
                            v-model.trim="c.notes"
                            class="input"
                            type="text"
                            placeholder="Optional…"
                            :disabled="participantNotesSavingClientId === c.clientId"
                            @blur="saveParticipantNotes(c)"
                          />
                        </td>
                        <td class="sbep-roster-actions">
                          <div class="sbep-row-action-stack">
                            <button
                              type="button"
                              class="btn btn-primary btn-sm sbep-row-save-btn"
                              :disabled="participantWorkflowSavingClientId === c.clientId || participantNotesSavingClientId === c.clientId"
                              @click="saveParticipantRow(c)"
                            >
                              Save
                            </button>
                            <span
                              v-if="participantRowSaveStatus[c.clientId]"
                              class="sbep-row-save-status"
                              :class="`is-${participantRowSaveStatus[c.clientId].state}`"
                              :title="participantRowSaveStatus[c.clientId].message || ''"
                            >
                              <template v-if="participantRowSaveStatus[c.clientId].state === 'saving'">Saving…</template>
                              <template v-else-if="participantRowSaveStatus[c.clientId].state === 'saved'">Saved ✓</template>
                              <template v-else-if="participantRowSaveStatus[c.clientId].state === 'error'">Error</template>
                            </span>
                            <button type="button" class="btn btn-link btn-sm sbep-row-remove-btn" @click="removeGenericParticipant(c)">Remove</button>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                </template>
              </div>
              <p v-else class="muted small">
                <template v-if="participantStatusFilter === 'registrants' && participantCounts.all > 0">
                  No active registrants — all enrolled clients have accepted intake.
                </template>
                <template v-else-if="participantStatusFilter === 'participants' && participantCounts.all > 0">
                  No participants yet. Accept intake on the
                  <button type="button" class="btn btn-link btn-sm sbep-reg-jump-btn" @click="setParticipantStatusFilter('registrants')">
                    Registrants ({{ participantCounts.registrants }})
                  </button>
                  list to move clients here.
                </template>
                <template v-else>No participants enrolled yet.</template>
              </p>
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-show="railActive === 'materials'"
              rail-mode
              section-id="materials"
              title="Materials"
              icon-url=""
            >
              <SkillBuildersSessionCurriculumMaterials
                v-if="eventBillingAgencyId && eventId"
                :agency-id="eventBillingAgencyId"
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
              icon-url=""
            >
              <p class="muted small sbep-card-lead">
                H2014 copy-aid notes for this event (encrypted; expire after 14 days — warning in the last 2 days). Matches the
                program hub <strong>Notes</strong> tab.
              </p>
              <SkillBuildersClinicalNotesHubPanel
                v-if="eventBillingAgencyId && eventId"
                :agency-id="eventBillingAgencyId"
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
              icon-url=""
              badge="Open"
            >
              <div class="sbep-section-intro">
                <p class="muted small sbep-card-lead">
                  This program is included in the <strong>guardian registration catalog</strong> when the window is open.
                  Families enroll eligible dependents from the guardian portal.
                </p>
                <p v-if="registrationPayerLines.length" class="muted small">
                  <strong>Payer options:</strong> {{ registrationPayerLines.join(' · ') }}
                </p>
                <p v-if="registrationRateLines.length" class="muted small">
                  <strong>Rates:</strong> {{ registrationRateLines.join(' · ') }}
                </p>
                <p v-else class="muted small">Set Medicaid / cash eligibility under <strong>Edit event</strong> (registration catalog).</p>
                <p v-if="guardianPortalLink" class="muted small sbep-guardian-portal-line">
                  <router-link class="sbep-text-link" :to="guardianPortalLink">Open guardian portal</router-link>
                  <span class="sbep-text-link-meta"> — Registration section</span>
                </p>
              </div>
              <div v-if="linkedIntakeForm" class="sbep-reg-intake-box">
                <p class="muted small sbep-reg-intake-title">
                  <strong>Digital form</strong>
                  <span class="sbep-reg-intake-name">
                    {{ linkedIntakeForm.title || 'Event registration form' }}
                  </span>
                  <span v-if="linkedIntakeForm.formType" class="muted"> · {{ linkedIntakeForm.formType }}</span>
                  <span v-if="linkedIntakeForm.totalLinksForEvent > 1" class="muted">
                    · {{ linkedIntakeForm.totalLinksForEvent }} linked (showing newest active)
                  </span>
                </p>
                <div class="sbep-inline-actions sbep-action-toolbar">
                  <a
                    v-if="intakeFormUrl"
                    class="btn btn-secondary btn-sm"
                    :href="intakeFormUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open digital form
                  </a>
                  <button v-if="intakeFormUrl" type="button" class="btn btn-secondary btn-sm" @click="copyIntakeFormLink">
                    Copy form link
                  </button>
                </div>
              </div>
              <div v-if="registrationShareHref || eventPublicPageHref" class="sbep-inline-actions sbep-action-toolbar sbep-action-toolbar--tight">
                <router-link v-if="registrationShareHref && registrationShareHref.startsWith('/')" class="btn btn-secondary btn-sm" :to="registrationShareHref">
                  Open registration link
                </router-link>
                <a
                  v-else-if="registrationShareHref"
                  class="btn btn-secondary btn-sm"
                  :href="registrationShareHref"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open registration link
                </a>
                <a
                  v-if="eventPublicPageHref"
                  class="btn btn-secondary btn-sm"
                  :href="eventPublicPageHref"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Public event page
                </a>
                <button v-if="registrationShareHref" type="button" class="btn btn-secondary btn-sm" @click="copyRegistrationLink">
                  Copy registration link
                </button>
                <button v-if="registrationShareHref" type="button" class="btn btn-secondary btn-sm" @click="copyRegistrationShareBlurb">
                  Copy registration share text
                </button>
              </div>
              <p v-if="copyHint" class="muted small sbep-copy-hint">{{ copyHint }}</p>

              <!-- Enrolled client count + quick nav to Clients tab -->
              <div class="sbep-reg-enrolled-summary">
                <template v-if="rosterCount">
                  <p class="muted small">
                    <strong>{{ rosterCount }}</strong>
                    {{ rosterCount === 1 ? 'client' : 'clients' }} currently enrolled on this program's roster.
                    <button type="button" class="btn btn-link btn-sm sbep-reg-jump-btn" @click="selectRailSection(rosterSectionId)">
                      View roster &amp; attendance →
                    </button>
                  </p>
                </template>
                <p v-else class="muted small">
                  No clients on the roster yet. Families can register through the guardian portal above, or coordinators can
                  <button type="button" class="btn btn-link btn-sm sbep-reg-jump-btn" @click="selectRailSection(rosterSectionId)">
                    add a client manually
                  </button>
                  from the <strong>{{ rosterSectionLabel }}</strong> tab.
                </p>
              </div>
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-if="detail.skillsGroup"
              v-show="railActive === 'work-schedule'"
              rail-mode
              section-id="work-schedule"
              title="Event Assignments"
              icon-url=""
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
              v-if="viewerCaps.isAssignedProvider && eventBillingAgencyId"
              v-show="railActive === 'my-work'"
              rail-mode
              section-id="my-work"
              title="My work schedule"
              icon-url=""
            >
              <p class="muted small sbep-card-lead">Your availability and booked dates for this event only.</p>
              <EventPortalMyWorkSchedulePanel
                :agency-id="eventBillingAgencyId"
                :event-id="eventId"
              />
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-if="viewerCaps.isAssignedProvider || viewerCaps.canManageTeamSchedules || viewerCaps.canManageCompanyEvent"
              v-show="railActive === 'attendance'"
              rail-mode
              section-id="attendance"
              title="Attendance"
              icon-url=""
            >
              <p class="muted small sbep-card-lead">
                Kiosk check-in and release activity for this event, plus provider payroll clock time.
              </p>

              <!-- Attendance planning: set what to expect on an upcoming day; shows on the kiosk -->
              <div v-if="viewerCaps.canManageCompanyEvent" class="sbep-plan-block">
                <h3 class="sbep-att-subhead">Attendance planning</h3>
                <p class="muted small">
                  Set what to expect for today or an upcoming day — planned absences, late arrivals, or removing someone who isn't returning.
                  These notes show on the day kiosk so staff know who to expect.
                </p>

                <div v-if="planError" class="error-box sbep-add-client-err">{{ planError }}</div>
                <div v-if="attendanceResetMessage" class="success-box sbep-add-client-err">{{ attendanceResetMessage }}</div>

                <div v-if="planSessionDates.length" class="sbep-att-filter-row sbep-plan-toolbar">
                  <label class="sbep-label">Day</label>
                  <select v-model="planDate" class="input sbep-kiosk-field">
                    <option v-for="d in planSessionDates" :key="`pd-${d}`" :value="d">{{ formatKioskAttDate(d) }}</option>
                  </select>
                  <button
                    v-if="planDate"
                    type="button"
                    class="btn btn-secondary btn-sm sbep-plan-reset"
                    :disabled="attendanceResetLoading"
                    @click="confirmResetAttendanceDay(planDate)"
                  >
                    {{ attendanceResetLoading ? 'Resetting…' : 'Reset this day' }}
                  </button>
                </div>
                <p v-else-if="!planLoading" class="muted small">
                  No session dates to plan for. Confirm this event has a start/end date and recurrence configured.
                </p>

                <div v-if="planDate && planParticipants.length" class="table-wrap">
                  <table class="table sbep-plan-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Status</th>
                        <th>Late arrival time</th>
                        <th>Note (shown on kiosk)</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="p in planParticipants" :key="`plan-${p.clientId}`">
                        <td>{{ p.name }}</td>
                        <td>
                          <select
                            v-if="planDrafts[p.clientId]"
                            v-model="planDrafts[p.clientId].status"
                            class="input sbep-plan-select"
                          >
                            <option value="">Expected as usual</option>
                            <option value="planned_absence">Planned absence (this day)</option>
                            <option value="late">Late arrival</option>
                            <option value="removed">Remove from future dates</option>
                          </select>
                        </td>
                        <td>
                          <input
                            v-if="planDrafts[p.clientId] && planDrafts[p.clientId].status === 'late'"
                            v-model="planDrafts[p.clientId].time"
                            class="input sbep-plan-time"
                            type="text"
                            placeholder="e.g. 9:30 AM"
                          />
                          <span v-else class="muted small">—</span>
                        </td>
                        <td>
                          <input
                            v-if="planDrafts[p.clientId]"
                            v-model="planDrafts[p.clientId].note"
                            class="input"
                            type="text"
                            maxlength="500"
                            placeholder="Optional note"
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            :disabled="planSavingClientId === p.clientId"
                            @click="savePlanRow(p)"
                          >
                            {{ planSavingClientId === p.clientId ? 'Saving…' : 'Save' }}
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p class="muted small">
                    "Remove from future dates" marks the client as not returning from the selected day onward — they're listed
                    separately on the kiosk so staff don't expect them. Set the status back to "Expected as usual" to undo.
                  </p>
                </div>
                <p v-else-if="planDate && !planParticipants.length" class="muted small">No enrolled participants to plan for yet.</p>
              </div>

              <div v-if="kioskAttendanceDates.length" class="sbep-att-filter-row">
                <label class="sbep-label">Event day</label>
                <select v-model="kioskAttDateFilter" class="input sbep-kiosk-field" @change="loadKioskAttendance">
                  <option value="">All days</option>
                  <option v-for="d in kioskAttendanceDates" :key="d" :value="d">{{ formatKioskAttDate(d) }}</option>
                </select>
                <button
                  v-if="viewerCaps.canManageCompanyEvent && kioskAttDateFilter"
                  type="button"
                  class="btn btn-secondary btn-sm sbep-plan-reset"
                  :disabled="attendanceResetLoading"
                  @click="confirmResetAttendanceDay(kioskAttDateFilter)"
                >
                  {{ attendanceResetLoading ? 'Resetting…' : 'Reset this day' }}
                </button>
              </div>

              <h3 class="sbep-att-subhead">Client check-in &amp; release</h3>
              <p class="muted small">Who checked in at the kiosk and who picked them up at release (with photo when captured).</p>
              <div v-if="kioskClientRows.length" class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Date</th>
                      <th>Check-in</th>
                      <th>Released to</th>
                      <th>Release time</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in kioskClientRows" :key="`kc-${row.clientId}-${row.kioskDate}`">
                      <td class="sbep-att-person">
                        <UserAvatar
                          size="sm"
                          :first-name="kioskClientAvatarNames(row).firstName"
                          :last-name="kioskClientAvatarNames(row).lastName"
                        />
                        <span>{{ row.clientName }}</span>
                      </td>
                      <td>{{ formatKioskAttDate(row.kioskDate) }}</td>
                      <td>{{ row.checkInAt ? formatPostTime(row.checkInAt) : '—' }}</td>
                      <td>
                        <template v-if="row.release">
                          <strong>{{ row.release.releasedToName }}</strong>
                          <span v-if="row.release.releasedToRelationship" class="muted small"> · {{ row.release.releasedToRelationship }}</span>
                          <span v-if="row.release.walkHomeAlone" class="muted small"> · Walk home</span>
                        </template>
                        <span v-else class="muted">Not released yet</span>
                      </td>
                      <td>{{ row.release?.signedAt ? formatPostTime(row.release.signedAt) : '—' }}</td>
                      <td>
                        <button
                          v-if="row.release"
                          type="button"
                          class="btn btn-link btn-sm"
                          @click="openKioskReleaseDetail(row)"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="muted">No client kiosk check-ins recorded yet.</p>

              <h3 class="sbep-att-subhead">Employee kiosk check-in</h3>
              <p class="muted small">Staff arrivals and departures recorded at the event station kiosk.</p>
              <div v-if="kioskEmployeeRowsFiltered.length" class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Date</th>
                      <th>Check-in</th>
                      <th>Check-out</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in kioskEmployeeRowsFiltered" :key="`ke-${row.userId}-${row.kioskDate}`">
                      <td class="sbep-att-person">
                        <UserAvatar
                          size="sm"
                          :photo-path="row.profilePhotoUrl"
                          :first-name="row.firstName || ''"
                          :last-name="row.lastName || ''"
                        />
                        <span>{{ row.displayName }}</span>
                      </td>
                      <td>{{ formatKioskAttDate(row.kioskDate) }}</td>
                      <td>{{ row.checkInAt ? formatPostTime(row.checkInAt) : '—' }}</td>
                      <td>{{ row.checkOutAt ? formatPostTime(row.checkOutAt) : '—' }}</td>
                      <td>{{ row.status === 'checked_out' ? 'Checked out' : 'On site' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="muted">No employee kiosk check-ins recorded yet.</p>

              <h3 class="sbep-att-subhead">Provider payroll hours</h3>
              <p v-if="viewerCaps.isAssignedProvider" class="muted small">Your event kiosk clock in/out and payroll hour split.</p>
              <p v-else class="muted small">Provider event time recorded from the event station kiosk.</p>
              <div class="actions" style="margin-bottom: 10px;">
                <button class="btn btn-secondary btn-sm" type="button" @click="exportEventClockCsv">
                  Download CSV
                </button>
              </div>
              <div v-if="providerAttendancePaired.length" class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Clock in</th>
                      <th>Clock out</th>
                      <th class="right">Worked</th>
                      <th class="right">Direct</th>
                      <th class="right">Indirect</th>
                      <th>Payroll status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, idx) in providerAttendancePaired" :key="`pa-${idx}`">
                      <td>{{ row.providerName || providerNameById(row.userId) }}</td>
                      <td>{{ formatPostTime(row.clockInAt) }}</td>
                      <td>{{ row.clockOutAt ? formatPostTime(row.clockOutAt) : '—' }}</td>
                      <td class="right">{{ row.workedHours ?? '—' }}</td>
                      <td class="right">{{ row.directHours ?? '—' }}</td>
                      <td class="right">{{ row.indirectHours ?? '—' }}</td>
                      <td>
                        <span v-if="row.directClaimStatus">D: {{ row.directClaimStatus }}</span>
                        <span v-if="row.indirectClaimStatus"> · I: {{ row.indirectClaimStatus }}</span>
                        <span v-if="!row.directClaimStatus && !row.indirectClaimStatus" class="muted">Open</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="muted">No event time recorded yet.</p>
            </SkillBuildersEventDashboardSection>

            <div v-if="kioskReleaseDetailOpen" class="sbep-modal-overlay" @click.self="closeKioskReleaseDetail">
              <div class="sbep-modal-card sbep-release-detail">
                <header class="sbep-modal-hdr">
                  <div>
                    <h3 class="sbep-modal-title">Release — {{ kioskReleaseDetailRow?.clientName }}</h3>
                    <p v-if="kioskReleaseDetailRow?.kioskDate" class="muted small">{{ formatKioskAttDate(kioskReleaseDetailRow.kioskDate) }}</p>
                  </div>
                  <button type="button" class="btn btn-text" @click="closeKioskReleaseDetail">Close</button>
                </header>
                <template v-if="kioskReleaseDetailRow?.release">
                  <dl class="sbep-release-dl">
                    <dt>Check-in</dt>
                    <dd>{{ kioskReleaseDetailRow.checkInAt ? formatPostTime(kioskReleaseDetailRow.checkInAt) : '—' }}</dd>
                    <dt>Released to</dt>
                    <dd>
                      <strong>{{ kioskReleaseDetailRow.release.releasedToName }}</strong>
                      <span v-if="kioskReleaseDetailRow.release.releasedToRelationship"> · {{ kioskReleaseDetailRow.release.releasedToRelationship }}</span>
                    </dd>
                    <dt>Phone</dt>
                    <dd>{{ kioskReleaseDetailRow.release.releasedToPhone || '—' }}</dd>
                    <dt>Release signed</dt>
                    <dd>{{ formatPostTime(kioskReleaseDetailRow.release.signedAt) }}</dd>
                    <dt>Method</dt>
                    <dd>{{ kioskReleaseDetailRow.release.walkHomeAlone ? 'Walk home' : (kioskReleaseDetailRow.release.signerSourceMethod || 'Pickup') }}</dd>
                    <dt v-if="kioskReleaseDetailRow.release.notes">Notes</dt>
                    <dd v-if="kioskReleaseDetailRow.release.notes">{{ kioskReleaseDetailRow.release.notes }}</dd>
                  </dl>
                  <div v-if="kioskReleaseDetailRow.release.hasPhoto" class="sbep-release-photo-wrap">
                    <p class="sbep-label">Release photo</p>
                    <div v-if="kioskReleasePhotoLoading" class="muted small">Loading photo…</div>
                    <div v-else-if="kioskReleasePhotoError" class="error-box">{{ kioskReleasePhotoError }}</div>
                    <img v-else-if="kioskReleasePhotoUrl" :src="kioskReleasePhotoUrl" alt="Release photo" class="sbep-release-photo" />
                  </div>
                </template>
              </div>
            </div>

            <SkillBuildersEventDashboardSection
              v-if="detail.showKioskClockActions"
              v-show="railActive === 'kiosk'"
              rail-mode
              section-id="kiosk"
              title="Kiosk / time"
              icon-url=""
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
              icon-url=""
            >
              <p class="muted small sbep-card-lead">
                Linked learning class ID <strong>{{ detail.event.learningProgramClassId }}</strong>. View standards-aligned
                progress for event participants.
              </p>
              <div class="sbep-learning-controls">
                <label class="sbep-label">Student</label>
                <select v-model.number="learningInsightsClientId" class="input sbep-kiosk-field">
                  <option :value="0">Select a student…</option>
                  <option v-for="c in detail.clients || []" :key="`l-c-${c.id}`" :value="Number(c.id)">
                    {{ clientLabelForRow(c) }}
                  </option>
                </select>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  :disabled="learningInsightsLoading || !learningInsightsClientId"
                  @click="loadLearningInsights"
                >
                  {{ learningInsightsLoading ? 'Loading…' : 'Refresh' }}
                </button>
              </div>
              <div v-if="learningInsightsError" class="error-box">{{ learningInsightsError }}</div>
              <template v-else-if="learningInsightsClientId">
                <div class="sbep-learning-grid">
                  <div class="sbep-learning-card">
                    <p class="sbep-subh">Domain trends</p>
                    <ul v-if="learningInsightsDomains.length" class="sbep-list">
                      <li v-for="row in learningInsightsDomains" :key="`ld-${row.domain_id}`">
                        <strong>{{ row.domain_title || row.domain_code || `Domain ${row.domain_id}` }}</strong>
                        <span class="muted small">
                          · {{ Number(row.evidence_count || 0) }} points
                          <template v-if="row.avg_score != null"> · avg {{ formatLearningScore(row.avg_score) }}</template>
                        </span>
                      </li>
                    </ul>
                    <p v-else class="muted small">No domain trend data yet.</p>
                  </div>
                  <div class="sbep-learning-card">
                    <p class="sbep-subh">Active goals</p>
                    <ul v-if="learningInsightsGoals.length" class="sbep-list">
                      <li v-for="g in learningInsightsGoals.slice(0, 6)" :key="`lg-${g.id}`">
                        <div>
                          <strong>{{ g.skill_title || `Skill ${g.skill_id}` }}</strong>
                          <span class="muted small"> · {{ g.status }} · target {{ formatLearningDate(g.target_date) }}</span>
                        </div>
                        <div v-if="canManageLearningGoals" class="sbep-inline-actions" style="margin-top: 4px;">
                          <button type="button" class="btn btn-secondary btn-sm" @click="beginEditLearningGoal(g)">Edit</button>
                          <button
                            v-if="g.status !== 'active'"
                            type="button"
                            class="btn btn-secondary btn-sm"
                            @click="activateLearningGoal(g)"
                          >
                            Activate
                          </button>
                          <button
                            v-if="g.status !== 'closed'"
                            type="button"
                            class="btn btn-secondary btn-sm"
                            @click="archiveLearningGoal(g)"
                          >
                            Archive
                          </button>
                        </div>
                      </li>
                    </ul>
                    <p v-else class="muted small">No goals found for this student.</p>
                  </div>
                </div>
                <div class="sbep-learning-card">
                  <p class="sbep-subh">Recommended next skills</p>
                  <ul v-if="learningInsightsRecommendations.length" class="sbep-list">
                    <li v-for="r in learningInsightsRecommendations.slice(0, 5)" :key="`lr-${r.domain_id}-${r.skill_id}`">
                      <strong>{{ r.skill_title || `Skill ${r.skill_id}` }}</strong>
                      <span class="muted small">
                        · {{ r.domain_title || `Domain ${r.domain_id}` }}
                        · {{ r.recommended_difficulty_shift }}
                      </span>
                    </li>
                  </ul>
                  <p v-else class="muted small">No recommendations yet.</p>
                </div>
                <div v-if="canManageLearningGoals" class="sbep-learning-card">
                  <div class="sbep-inline-actions" style="justify-content: space-between; align-items: center;">
                    <p class="sbep-subh" style="margin: 0;">Goal editor</p>
                    <button type="button" class="btn btn-secondary btn-sm" @click="openNewLearningGoalForm">
                      New goal
                    </button>
                  </div>
                  <div v-if="learningCatalogError" class="error-box" style="margin-top: 8px;">{{ learningCatalogError }}</div>
                  <div v-else-if="learningCatalogLoading" class="muted small" style="margin-top: 8px;">Loading standards catalog…</div>
                  <div v-else-if="learningGoalFormOpen" class="sbep-learning-goal-form">
                    <div class="sbep-learning-goal-form-grid">
                      <div>
                        <label class="sbep-label">Domain</label>
                        <select v-model.number="learningGoalForm.domainId" class="input sbep-kiosk-field">
                          <option :value="0">Select domain…</option>
                          <option v-for="d in learningCatalogDomains" :key="`ldm-${d.id}`" :value="Number(d.id)">
                            {{ d.title || d.code }}
                          </option>
                        </select>
                      </div>
                      <div>
                        <label class="sbep-label">Skill</label>
                        <select v-model.number="learningGoalForm.skillId" class="input sbep-kiosk-field">
                          <option :value="0">Select skill…</option>
                          <option v-for="s in filteredLearningSkills" :key="`lsk-${s.id}`" :value="Number(s.id)">
                            {{ s.title }}
                          </option>
                        </select>
                      </div>
                      <div>
                        <label class="sbep-label">Measurement</label>
                        <select v-model="learningGoalForm.measurementType" class="input sbep-kiosk-field">
                          <option value="numeric">Numeric</option>
                          <option value="rubric">Rubric</option>
                        </select>
                      </div>
                      <div>
                        <label class="sbep-label">Start date</label>
                        <input v-model="learningGoalForm.startDate" type="date" class="input sbep-kiosk-field" />
                      </div>
                      <div>
                        <label class="sbep-label">Target date</label>
                        <input v-model="learningGoalForm.targetDate" type="date" class="input sbep-kiosk-field" />
                      </div>
                      <div v-if="learningGoalForm.measurementType === 'numeric'">
                        <label class="sbep-label">Baseline value</label>
                        <input v-model.number="learningGoalForm.baselineValue" type="number" step="0.01" class="input sbep-kiosk-field" />
                      </div>
                      <div v-if="learningGoalForm.measurementType === 'numeric'">
                        <label class="sbep-label">Target value</label>
                        <input v-model.number="learningGoalForm.targetValue" type="number" step="0.01" class="input sbep-kiosk-field" />
                      </div>
                      <div v-if="learningGoalForm.measurementType === 'rubric'">
                        <label class="sbep-label">Baseline rubric</label>
                        <input v-model.trim="learningGoalForm.baselineRubricLevel" class="input sbep-kiosk-field" placeholder="e.g., Emerging" />
                      </div>
                      <div v-if="learningGoalForm.measurementType === 'rubric'">
                        <label class="sbep-label">Target rubric</label>
                        <input v-model.trim="learningGoalForm.targetRubricLevel" class="input sbep-kiosk-field" placeholder="e.g., Proficient" />
                      </div>
                    </div>
                    <label class="sbep-label">Notes (optional)</label>
                    <textarea v-model.trim="learningGoalForm.notes" class="input" rows="3" />
                    <div v-if="learningGoalFormError" class="error-box">{{ learningGoalFormError }}</div>
                    <div class="sbep-inline-actions" style="margin-top: 8px;">
                      <button type="button" class="btn btn-primary btn-sm" :disabled="learningGoalSaving" @click="saveLearningGoal">
                        {{ learningGoalSaving ? 'Saving…' : (learningGoalForm.goalId ? 'Save goal' : 'Create goal') }}
                      </button>
                      <button type="button" class="btn btn-secondary btn-sm" :disabled="learningGoalSaving" @click="cancelLearningGoalForm">
                        Cancel
                      </button>
                    </div>
                  </div>
                  <p v-else class="muted small" style="margin-top: 8px;">Create or edit standards-linked goals for this student.</p>
                </div>
              </template>
              <p v-else class="muted small">Select a student to view learning insights.</p>
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-show="railActive === 'event-chat'"
              rail-mode
              section-id="event-chat"
              title="Event chat"
              icon-url=""
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
          v-if="eventBillingAgencyId && eventId"
          v-model="editEventModalOpen"
          :agency-id="eventBillingAgencyId"
          :event-id="eventId"
          :portal-slug="String(detail?.programPortal?.slug || route.params.organizationSlug || '')"
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
import { eventCategorySingularLabel, isSkillBuildersEventType } from '../../utils/eventTypeLabels';
import SkillBuildersEventPortalLayout from '../../components/skillBuilders/SkillBuildersEventPortalLayout.vue';
import SkillBuildersEventDashboardSection from '../../components/skillBuilders/SkillBuildersEventDashboardSection.vue';
import EventPortalMyWorkSchedulePanel from '../../components/availability/EventPortalMyWorkSchedulePanel.vue';
import SkillBuildersSessionCurriculumMaterials from '../../components/skillBuilders/SkillBuildersSessionCurriculumMaterials.vue';
import SkillBuildersEventEditModal from '../../components/skillBuilders/SkillBuildersEventEditModal.vue';
import SkillBuildersEventProvidersGrid from '../../components/skillBuilders/SkillBuildersEventProvidersGrid.vue';
import SkillBuildersClinicalNotesHubPanel from '../../components/skillBuilders/SkillBuildersClinicalNotesHubPanel.vue';
import UserAvatar from '../../components/common/UserAvatar.vue';
import { buildPublicIntakeUrl } from '../../utils/publicIntakeUrl';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const loading = ref(false);
const error = ref('');
const detail = ref(null);
const genericParticipants = ref([]);
const genericParticipantsLoading = ref(false);
const genericParticipantsError = ref('');
const scheduleParticipants = ref([]);
const scheduleParticipantsLoading = ref(false);
const scheduleParticipantsError = ref('');
const participantProviders = ref([]);
const participantProvidersLoading = ref(false);
const participantProvidersError = ref('');
const participantWorkflowSavingClientId = ref(0);
const participantNotesSavingClientId = ref(0);
/** Workflow-status filter for the participants section: 'registrants' | 'participants'. */
const participantStatusFilter = ref('registrants');
const rosterRegisterAsParticipant = ref(false);

watch(
  participantStatusFilter,
  (filter) => {
    if (!detail.value?.skillsGroup) {
      rosterRegisterAsParticipant.value = filter === 'participants';
    }
  },
  { immediate: true }
);
/** Backend-derived counts so registrant pulse + applicants card reflect reality without a 2nd request */
const participantCounts = ref({ all: 0, registrants: 0, participants: 0, denied: 0 });
/** Per-session-group breakdown for participants only (empty unless staffing groups exist) */
const participantGroupCounts = ref([]);
/**
 * Per-row save-status feedback so coordinators see autosave finish.
 * Map: clientId -> { state: 'saving'|'saved'|'error', message?: string, ts: number }
 */
const participantRowSaveStatus = ref({});
const participantRowSaveTimers = new Map();
function setParticipantRowSaveStatus(clientId, state, message) {
  const id = Number(clientId || 0);
  if (!id) return;
  const next = { ...participantRowSaveStatus.value };
  next[id] = { state, message: message || '', ts: Date.now() };
  participantRowSaveStatus.value = next;
  if (participantRowSaveTimers.has(id)) {
    clearTimeout(participantRowSaveTimers.get(id));
    participantRowSaveTimers.delete(id);
  }
  if (state === 'saved' || state === 'error') {
    const timer = setTimeout(() => {
      const cur = { ...participantRowSaveStatus.value };
      delete cur[id];
      participantRowSaveStatus.value = cur;
      participantRowSaveTimers.delete(id);
    }, state === 'saved' ? 2200 : 4000);
    participantRowSaveTimers.set(id, timer);
  }
}

// Staffing blocks (non–Skill Builders program events)
const staffingSummaryLoading = ref(false);
const staffingSummaryError = ref('');
const staffingSummary = ref(null); // { staffingConfig, sessions: [] }
const staffingActiveSessionDateId = ref(0);
const staffingSessionGroupsLoading = ref(false);
const staffingSessionGroupsError = ref('');
const staffingSessionGroups = ref([]);
const staffingNewGroupLabel = ref('');
const staffingNewGroupSaving = ref(false);
const staffingNewGroupError = ref('');
const staffingSessionAssignmentsLoading = ref(false);
const staffingSessionAssignmentsError = ref('');
const staffingSessionAssignments = ref({}); // { [clientId]: groupId|null }
const staffingSessionRequestsLoading = ref(false);
const staffingSessionRequestsError = ref('');
const staffingSessionRequests = ref([]);
const staffingRequestDecisionSavingId = ref(0);
const editEventModalOpen = ref(false);
const sessions = ref([]);
const sessionsLoading = ref(false);
const sessionsLoadAttempted = ref(false);
const sessionsLoadError = ref('');
const sessionEditDraft = reactive({});
const sessionEditSavingId = ref(null);
const applyDefaultsLoading = ref(false);
const virtualRoomsGenerating = ref(false);
const kioskSessionId = ref(0);
const kioskClientId = ref(0);

const rosterSectionId = computed(() => (detail.value?.skillsGroup ? 'clients' : 'participants'));
const rosterSectionLabel = computed(() => (detail.value?.skillsGroup ? 'Client Management' : 'Participants'));
const rosterCount = computed(() =>
  detail.value?.skillsGroup ? (detail.value?.clients || []).length : genericParticipants.value.length
);

/** @type {Record<number, number[]>} */
const sessionStaffDraft = reactive({});
const sessionStaffSavingId = ref(null);
const sessionStaffFlash = ref('');
let sessionStaffFlashTimer = null;

const eventId = computed(() => Number(route.params.eventId));
const organizationSlug = computed(() => String(route.params.organizationSlug || '').trim());
const isProgramSessionMode = computed(
  () => !detail.value?.skillsGroup && Number(detail.value?.event?.organizationId || 0) > 0
);

/** Billing/parent agency id for Skill Builders APIs (not the program portal org from the URL). */
const eventBillingAgencyId = computed(() => {
  const fromDetail = Number(detail.value?.event?.agencyId || 0);
  if (fromDetail > 0) return fromDetail;
  const t = String(
    agencyStore.currentAgency?.organization_type || agencyStore.currentAgency?.organizationType || ''
  ).toLowerCase();
  if (t === 'program' || t === 'school' || t === 'learning') return 0;
  return Number(agencyStore.currentAgency?.id || 0);
});

const portalKicker = computed(() => {
  // Pull the event's *actual* type rather than blanket-saying "Skill Builders".
  // Most program events aren't Skill Builders (e.g. summer programs, workshops)
  // — only label as Skill Builders when the event truly is.
  const ev = detail.value?.event || {};
  const typeLabel = eventCategorySingularLabel(ev.eventType ?? ev.event_type);
  const programName = String(detail.value?.programPortal?.name || '').trim();
  if (programName) return `${typeLabel} · ${programName}`;
  if (isSkillBuildersEventType(ev.eventType ?? ev.event_type)) return `${typeLabel} · Skill Builders`;
  return typeLabel;
});

/**
 * Generic fallback for places that need a noun for the event when
 * `event.title` is missing — e.g. CSV exports, copy-share blurbs.
 */
const eventNounFallback = computed(() => {
  const ev = detail.value?.event || {};
  return eventCategorySingularLabel(ev.eventType ?? ev.event_type);
});

const programEventsHref = computed(() => {
  const ag = detail.value?.agencyPortalSlug;
  const ps = detail.value?.programPortal?.slug;
  if (!ag || !ps) return null;
  return `/${ag}/programs/${ps}/events`;
});

/** Public page: program enrollments + events (share with families). */
const programEnrollHubHref = computed(() => {
  const ag = detail.value?.agencyPortalSlug;
  const ps = detail.value?.programPortal?.slug;
  if (!ag || !ps) return null;
  return `/${ag}/programs/${ps}/enroll`;
});

const eventPublicPageHref = computed(() => {
  if (typeof window === 'undefined') return '';
  const origin = String(window.location.origin || '').replace(/\/$/, '');
  if (programEventsHref.value) {
    return `${origin}${programEventsHref.value}`;
  }
  const id = Number(eventId.value || 0);
  if (!id) return '';
  return `${origin}/company-events/${id}`;
});

const registrationShareHref = computed(() => {
  if (programEnrollHubHref.value) return programEnrollHubHref.value;
  if (programEventsHref.value) return programEventsHref.value;
  return eventPublicPageHref.value || '';
});

const linkedIntakeForm = computed(() => {
  const li = detail.value?.linkedIntake;
  if (!li || !li.publicKey) return null;
  return li;
});

const intakeFormUrl = computed(() => {
  const key = String(linkedIntakeForm.value?.publicKey || '').trim();
  if (!key) return '';
  return buildPublicIntakeUrl(key);
});

const dashboardHref = computed(() => {
  const s = organizationSlug.value;
  if (!s) return null;
  return `/${s}/dashboard`;
});

const classPresentationHref = computed(() => {
  const s = organizationSlug.value;
  if (!s || !eventId.value) return null;
  return {
    path: `/${s}/class-presentation-dashboard/${eventId.value}`,
    query: {
      role: viewerCaps.value?.canManageCompanyEvent ? 'host' : 'participant',
      title: String(detail.value?.event?.title || 'Class Presentation Dashboard').trim(),
      agencyId: String(eventBillingAgencyId.value || '')
    }
  };
});

const classBuilderHref = computed(() => {
  const s = organizationSlug.value;
  if (!s || !eventId.value) return null;
  return {
    path: `/${s}/class-presentation-builder/${eventId.value}`,
    query: {
      agencyId: String(eventBillingAgencyId.value || '')
    }
  };
});

/** Link to guardian home (registration catalog lives there). */
const guardianRegistrationHref = computed(() => {
  const s = organizationSlug.value;
  if (!s) return null;
  return `/${s}/guardian`;
});

/** Guardian entry: superadmin preview, or login with redirect to guardian home. */
const guardianPortalLink = computed(() => {
  const s = organizationSlug.value;
  if (!s) return null;
  const role = String(authStore.user?.role || '').trim().toLowerCase();
  const target = `/${s}/guardian`;
  if (authStore.isAuthenticated && role === 'super_admin') {
    const q = { previewMode: 'superadmin' };
    const aid = eventBillingAgencyId.value;
    if (aid) q.previewAgencyId = String(aid);
    return { path: target, query: q };
  }
  return { path: `/${s}/login`, query: { redirect: target } };
});

const registrationPayerLines = computed(() => {
  const e = detail.value?.event;
  if (!e?.registrationEligible) return [];
  const parts = [];
  if (e.medicaidEligible) parts.push('Medicaid');
  if (e.cashEligible) parts.push('Cash / self-pay');
  return parts;
});

const registrationRateLines = computed(() => {
  const e = detail.value?.event;
  if (!e?.cashEligible) return [];
  const out = [];
  const total = Number(e.programCostDollars);
  const perSession = Number(e.perSessionCostDollars);
  if (Number.isFinite(total) && total > 0) out.push(`Series package $${total.toFixed(2)}`);
  if (Number.isFinite(perSession) && perSession > 0) out.push(`Per session $${perSession.toFixed(2)}`);
  if (
    Number.isFinite(total) &&
    total > 0 &&
    Number.isFinite(perSession) &&
    perSession > 0 &&
    Number.isFinite(sessions.value?.length) &&
    sessions.value.length > 0
  ) {
    const equiv = total / Math.max(1, sessions.value.length);
    out.push(`Series equivalent ~$${equiv.toFixed(2)}/session over ${sessions.value.length} sessions`);
  }
  return out;
});

const eventAboutText = computed(() => {
  const e = detail.value?.event || {};
  const splash = String(e.splashContent || '').trim();
  const desc = String(e.description || '').trim();
  return splash || desc || '';
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

/** Assigned facilitators may browse roster/materials; only coordinators edit event config. */
const canViewParticipantsTab = computed(
  () => viewerCaps.value.canManageCompanyEvent || viewerCaps.value.isAssignedProvider
);

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

function sectionTeaser(sectionId) {
  const lines = {
    schedule: 'Calendar links, session grid, locations, and virtual join windows.',
    providers: 'Staff roster and directory-style cards for this event.',
    clients: 'Program roster, attendance, and coordinator tools.',
    participants: 'Participant list for non–skills-group program events.',
    clinical_notes: 'Session notes, H2014-style tools, and copy aids.',
    materials: 'Documents, PDFs, and the shared program library.',
    registrations: 'Enrollment, capacity, and registration-aware actions.',
    'work-schedule': 'Assign providers to dates and roles for this event.',
    'my-work': 'Your availability and booked dates for this event.',
    attendance: 'Clock activity, hours, and attendance review.',
    kiosk: 'Shared kiosk clock in/out for this event.',
    learning: 'Learning class tools, goals, and insights when linked.',
    'event-chat': 'Discussion and updates scoped to this event.'
  };
  return lines[sectionId] || 'Open this part of the workspace.';
}

function tabMetaLine(sectionId) {
  const t = sectionTeaser(sectionId);
  if (t.length <= 44) return t;
  return `${t.slice(0, 41)}…`;
}

function railTextMark(shortLabel) {
  const s = String(shortLabel || '').trim();
  if (!s) return '·';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${(parts[0][0] || '').toUpperCase()}${(parts[parts.length - 1][0] || '').toUpperCase()}` || '·';
}

const hubQuickStats = computed(() => {
  const d = detail.value;
  if (!d) return [];
  const stats = [];
  const nMeet = (d.meetings || []).length;
  if (nMeet) stats.push({ label: 'Weekly pattern rows', value: String(nMeet) });
  const nProv = (d.providers || []).length;
  stats.push({ label: 'Providers on roster', value: String(nProv) });
  if (d.skillsGroup) {
    const nCli = (d.clients || []).length;
    stats.push({ label: 'Clients on roster', value: String(nCli) });
  } else if (genericParticipants.value?.length) {
    stats.push({ label: 'Participants', value: String(genericParticipants.value.length) });
  }
  const nSess = sessions.value.length;
  if (nSess) stats.push({ label: 'Scheduled sessions', value: String(nSess) });
  if (d.event?.registrationEligible) stats.push({ label: 'Registrations', value: 'On' });
  return stats.slice(0, 5);
});

const eventRailItems = computed(() => {
  const d = detail.value;
  if (!d) return [];
  const v = viewerCaps.value;
  const items = [];
  const push = (id, label, shortLabel, ok) => {
    if (!ok) return;
    items.push({
      id,
      label,
      shortLabel: shortLabel || label
    });
  };

  push('home', 'Home', 'Home', true);

  const cal = d.calendar;
  const hasCal = !!(cal && (cal.googleCalendarUrl || cal.icsUrl));
  push('schedule', 'Schedule', 'Schedule', hasCal || !!d.skillsGroup);

  const nProv = (d.providers || []).length;
  push('providers', 'Providers', 'Providers', nProv > 0 || !!v.canManageCompanyEvent);

  const nCli = (d.clients || []).length;
  push('clients', 'Client Management', 'Clients', !!d.skillsGroup && nCli > 0);
  push('participants', 'Participants', 'Participants', canViewParticipantsTab.value);

  const role = String(authStore.user?.role || '').toLowerCase();
  const isGuardianPortalUser = role === 'guardian' || role === 'client_guardian';
  const showClinicalAidCard =
    !isGuardianPortalUser &&
    clinicalNotesEnabled.value &&
    !!d.skillsGroup &&
    !!(v.isAssignedProvider || v.canManageTeamSchedules || v.canManageCompanyEvent);
  push('clinical_notes', 'Clinical Aid', 'Aid', showClinicalAidCard);

  push('materials', 'Materials', 'Materials', true);

  if (d.event?.registrationEligible) {
    push('registrations', 'Registrations', 'Registrations', true);
  }

  if (d.skillsGroup) {
    push('work-schedule', 'Event Assignments', 'Assign', true);
  }

  if (v.isAssignedProvider && eventBillingAgencyId.value) {
    push('my-work', 'My work schedule', 'My work', true);
  }
  if (v.isAssignedProvider || v.canManageTeamSchedules || v.canManageCompanyEvent) {
    push('attendance', 'Attendance', 'Attendance', true);
  }
  if (d.showKioskClockActions) {
    push('kiosk', 'Kiosk / time', 'Kiosk', true);
  }

  if (d.event?.learningProgramClassId) {
    push('learning', 'Learning', 'Learning', true);
  }

  push('event-chat', 'Event chat', 'Chat', true);

  return items;
});

const hubRailItems = computed(() => eventRailItems.value.filter((item) => item.id !== 'home'));

/** Keep the current path (params are already in it); only the query changes — avoids named-route param quirks. */
function replaceEventPortalQuery(nextQuery) {
  return router.replace({ path: route.path, query: nextQuery });
}
function pushEventPortalQuery(nextQuery) {
  return router.push({ path: route.path, query: nextQuery });
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
    await pushEventPortalQuery({ ...route.query, section });
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
const scheduleEmptyMessage = computed(() => {
  const err = String(sessionsLoadError.value || '').toLowerCase();
  if (err.includes('migration') || err.includes('not migrated') || err.includes('run migration')) {
    return 'Program sessions are not available yet in this environment. A database migration is required before weekly occurrences can display.';
  }
  const hasRecurringRule = !!detail.value?.calendar?.hasRecurrence;
  if (!hasRecurringRule) {
    return 'This event has no recurring schedule configured yet. Set recurrence and save, then sessions will appear here.';
  }
  return 'Recurrence exists, but no materialized sessions were found in the selected range yet. Save the event again to regenerate session dates.';
});

function sessionTimeText(s) {
  return `${wallHmToDisplay(formatHm(s?.startTime))}–${wallHmToDisplay(formatHm(s?.endTime))}`;
}

/** Returns only the session-explicit location text (not event-level fallback). */
function sessionExplicitLocation(s) {
  return String(s?.locationLabel || s?.locationAddress || '').trim();
}

/** Returns only the session-explicit modality as display text (not event-level fallback). */
function sessionExplicitModality(s) {
  const raw = String(s?.modality || '').trim().toLowerCase();
  if (raw === 'in_person') return 'In person';
  if (raw === 'virtual') return 'Virtual';
  if (raw === 'hybrid') return 'Hybrid';
  return raw ? raw.replace(/_/g, ' ') : '';
}

/** For display in session table rows — includes event-level fallback so row never shows blank when a default exists. */
function sessionLocationText(s) {
  return (
    sessionExplicitLocation(s) ||
    String(
      detail.value?.event?.eventLocationName ||
      detail.value?.event?.eventLocationAddress ||
      detail.value?.event?.publicLocationAddress ||
      ''
    ).trim()
  );
}

/** For display in session table rows — includes event-level fallback. */
function sessionModalityText(s) {
  return (
    sessionExplicitModality(s) ||
    (detail.value?.event?.inPersonPublic ? 'In person' : '')
  );
}

function sameNonEmptyValue(values) {
  const cleaned = values.map((v) => String(v || '').trim()).filter(Boolean);
  if (!cleaned.length) return '';
  const first = cleaned[0];
  return cleaned.every((v) => v === first) ? first : '';
}

const scheduleDefaults = computed(() => {
  const list = Array.isArray(sessions.value) ? sessions.value : [];
  const ev = detail.value?.event || {};

  // Event-level canonical defaults (set in Edit Event settings)
  const evLocation = String(ev.eventLocationName || ev.eventLocationAddress || ev.publicLocationAddress || '').trim();
  const evModality = ev.inPersonPublic ? 'In person' : '';

  // Session-derived fallbacks (used only when event-level fields are empty)
  const sessionLocs = list.map(sessionExplicitLocation);
  const sessionMods = list.map(sessionExplicitModality);
  const sessionLocFallback = sameNonEmptyValue(sessionLocs);
  const sessionModFallback = sameNonEmptyValue(sessionMods);

  const location = evLocation || sessionLocFallback;
  const modality = evModality || sessionModFallback;
  const time = list.length ? sameNonEmptyValue(list.map(sessionTimeText)) : '';

  // "All same" = a default is known AND no session has an explicit value that differs
  const allSameLocation = !!location && !list.some((s) => {
    const sl = sessionExplicitLocation(s);
    return sl && sl !== location;
  });
  const allSameModality = !!modality && !list.some((s) => {
    const sm = sessionExplicitModality(s);
    return sm && sm !== modality;
  });

  const overrideCount = list.filter((s) => {
    const sl = sessionExplicitLocation(s);
    const sm = sessionExplicitModality(s);
    return (sl && location && sl !== location) || (sm && modality && sm !== modality);
  }).length;

  return {
    time,
    location,
    modality,
    evLocation,
    evModality,
    allSameTime: !!time,
    allSameLocation,
    allSameModality,
    overrideCount,
    hasEventDefaults: !!(evLocation || evModality)
  };
});

const scheduleTableShowsLocation = computed(() => !scheduleDefaults.value?.allSameLocation);
const scheduleTableShowsModality = computed(() => !scheduleDefaults.value?.allSameModality);
const scheduleEditColspan = computed(() => 2 + (scheduleTableShowsLocation.value ? 1 : 0) + (scheduleTableShowsModality.value ? 1 : 0));

const scheduleSelectedSession = computed(() =>
  staffingSessions.value.find((s) => Number(s.sessionDateId) === Number(staffingActiveSessionDateId.value)) || null
);

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

function syncSessionEditDraft() {
  for (const key of Object.keys(sessionEditDraft)) delete sessionEditDraft[key];
  for (const s of sessions.value) {
    sessionEditDraft[s.id] = {
      locationLabel: s.locationLabel || '',
      locationAddress: s.locationAddress || '',
      modality: s.modality || '',
      joinUrl: s.joinUrl || ''
    };
  }
}

async function saveSessionStaff(sessionId) {
  if (!eventBillingAgencyId.value || !eventId.value) return;
  sessionStaffSavingId.value = sessionId;
  try {
    const raw = sessionStaffDraft[sessionId];
    const providerUserIds = Array.isArray(raw)
      ? raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    const res = await api.put(
      `/skill-builders/events/${eventId.value}/sessions/${sessionId}/providers`,
      { agencyId: eventBillingAgencyId.value, providerUserIds },
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

async function saveSessionInlineEdits(sessionId) {
  if (!eventBillingAgencyId.value || !eventId.value || !sessionEditDraft[sessionId]) return;
  sessionEditSavingId.value = sessionId;
  try {
    const endpoint = isProgramSessionMode.value
      ? `/skill-builders/events/${eventId.value}/program-sessions/${sessionId}`
      : `/skill-builders/events/${eventId.value}/sessions/${sessionId}`;
    const draft = sessionEditDraft[sessionId];
    await api.patch(
      endpoint,
      {
        agencyId: eventBillingAgencyId.value,
        locationLabel: String(draft.locationLabel || '').trim() || null,
        locationAddress: String(draft.locationAddress || '').trim() || null,
        modality: String(draft.modality || '').trim().toLowerCase() || null,
        joinUrl: String(draft.joinUrl || '').trim() || null
      },
      { skipGlobalLoading: true }
    );
    await loadSessions();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Could not save session details');
  } finally {
    sessionEditSavingId.value = null;
  }
}

async function applyEventDefaultsToAllSessions() {
  const ev = detail.value?.event;
  const list = Array.isArray(sessions.value) ? sessions.value : [];
  if (!ev || !eventBillingAgencyId.value || !eventId.value || !list.length) return;

  const evLocLabel = String(ev.eventLocationName || '').trim();
  const evLocAddress = String(ev.eventLocationAddress || ev.publicLocationAddress || '').trim();
  const evModalityRaw = ev.inPersonPublic ? 'in_person' : '';
  const evModalityDisplay = ev.inPersonPublic ? 'In person' : '(none)';
  const evLocDisplay = evLocLabel || evLocAddress || '(none)';

  if (!evLocLabel && !evLocAddress && !evModalityRaw) {
    window.alert(
      'No event-level location or modality to apply.\n\nSet "Event location name", "Event location address", or "In person" in the event settings first, then try again.'
    );
    return;
  }

  if (
    !window.confirm(
      `Apply event defaults to all ${list.length} session(s)?\n\nLocation: ${evLocDisplay}\nModality: ${evModalityDisplay}\n\nThis will overwrite any per-session overrides.`
    )
  )
    return;

  applyDefaultsLoading.value = true;
  try {
    for (const s of list) {
      const endpoint = isProgramSessionMode.value
        ? `/skill-builders/events/${eventId.value}/program-sessions/${s.id}`
        : `/skill-builders/events/${eventId.value}/sessions/${s.id}`;
      await api.patch(
        endpoint,
        {
          agencyId: eventBillingAgencyId.value,
          locationLabel: evLocLabel || null,
          locationAddress: evLocAddress || null,
          modality: evModalityRaw || null,
          joinUrl: String(s.joinUrl || '').trim() || null
        },
        { skipGlobalLoading: true }
      );
    }
    await loadSessions();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Could not apply defaults to sessions');
  } finally {
    applyDefaultsLoading.value = false;
  }
}

async function generateVirtualRoomsForSessions() {
  if (!eventBillingAgencyId.value || !eventId.value) return;
  virtualRoomsGenerating.value = true;
  try {
    await api.post(
      `/skill-builders/events/${eventId.value}/generate-virtual-rooms`,
      { agencyId: eventBillingAgencyId.value },
      { skipGlobalLoading: true }
    );
    await loadSessions();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Could not generate virtual rooms');
  } finally {
    virtualRoomsGenerating.value = false;
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
  if (!eventBillingAgencyId.value || !eventId.value) {
    sessions.value = [];
    syncSessionEditDraft();
    sessionsLoadAttempted.value = false;
    return;
  }
  const shouldLoad = !!detail.value?.skillsGroup || isProgramSessionMode.value;
  if (!shouldLoad) {
    sessions.value = [];
    syncSessionEditDraft();
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
    const basePath = isProgramSessionMode.value ? 'program-sessions' : 'sessions';
    const res = await api.get(`/skill-builders/events/${eventId.value}/${basePath}`, {
      params: { agencyId: eventBillingAgencyId.value, from, to },
      skipGlobalLoading: true
    });
    sessions.value = Array.isArray(res.data?.sessions) ? res.data.sessions : [];
    syncSessionStaffDraft();
    syncSessionEditDraft();
  } catch (e) {
    sessions.value = [];
    syncSessionStaffDraft();
    syncSessionEditDraft();
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
  const s =
    String(detail.value?.agencyPortalSlug || '').trim() || String(organizationSlug.value || '').trim();
  if (!s || !canOpenSkillBuildersEventsOverlay.value) return null;
  return `/${s}/admin/program-events`;
});

const canEditEventInPortal = computed(
  () => !!detail.value?.canManageCompanyEvent && eventBillingAgencyId.value > 0 && eventId.value > 0
);

const canEnrollEventClients = computed(
  () =>
    !!(viewerCaps.value.canManageCompanyEvent || viewerCaps.value.canManageTeamSchedules) &&
    eventBillingAgencyId.value > 0
);

const copyHint = ref('');

function goBack() {
  if (!dashHubMode.value) {
    openDashHub();
    return;
  }
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back();
    return;
  }
  if (dashboardHref.value) router.push(dashboardHref.value);
  else if (programEventsHref.value) router.push(programEventsHref.value);
}
const clockBusy = ref(false);
const clockMessage = ref('');

// Roster: add client to event inline search
const rosterAddQuery = ref('');
const rosterAddResults = ref([]);
const rosterAddSearching = ref(false);
const rosterAddSearched = ref(false);
const rosterAddSavingId = ref(null);
const rosterAddError = ref('');
const rosterAddSuccess = ref('');
let rosterAddSearchTimer = null;

function rosterClientLabel(c) {
  return c?.fullName || c?.initials || c?.identifierCode || `Client ${c?.clientId}`;
}

function rosterAddButtonLabel(c) {
  if (rosterAddSavingId.value === c?.clientId) return 'Adding…';
  if (!detail.value?.skillsGroup && rosterRegisterAsParticipant.value) return 'Enroll';
  return 'Add';
}

function scheduleRosterSearch() {
  rosterAddError.value = '';
  rosterAddSuccess.value = '';
  rosterAddSearched.value = false;
  if (rosterAddSearchTimer) clearTimeout(rosterAddSearchTimer);
  const q = String(rosterAddQuery.value || '').trim();
  if (!q) {
    rosterAddResults.value = [];
    return;
  }
  rosterAddSearchTimer = setTimeout(() => doRosterSearch(q), 320);
}

async function doRosterSearch(q) {
  const aid = eventBillingAgencyId.value;
  const eid = eventId.value;
  if (!aid || !eid) return;
  rosterAddSearching.value = true;
  rosterAddSearched.value = false;
  try {
    const useSkillsGroupSearch = !!detail.value?.skillsGroup;
    const res = useSkillsGroupSearch
      ? await api.get('/skill-builders/coordinator/master-clients', {
          params: { agencyId: aid, q },
          skipGlobalLoading: true
        })
      : await api.get(`/company-events/${eid}/client-search`, {
          params: { agencyId: aid, q },
          skipGlobalLoading: true
        });
    rosterAddResults.value = Array.isArray(res.data?.clients) ? res.data.clients : [];
  } catch (e) {
    rosterAddResults.value = [];
    rosterAddError.value = e.response?.data?.error?.message || e.message || 'Could not search clients';
  } finally {
    rosterAddSearching.value = false;
    rosterAddSearched.value = true;
  }
}

async function addClientToRoster(c) {
  const aid = eventBillingAgencyId.value;
  const eid = eventId.value;
  if (!aid || !eid || !c?.clientId) return;
  rosterAddSavingId.value = c.clientId;
  rosterAddError.value = '';
  rosterAddSuccess.value = '';
  try {
    if (detail.value?.skillsGroup) {
      await api.post(`/skill-builders/coordinator/clients/${c.clientId}/assign-event`, {
        agencyId: aid,
        companyEventId: eid
      });
    } else {
      const res = await api.post(`/company-events/${eid}/clients`, {
        agencyId: aid,
        clientId: c.clientId,
        registerAsParticipant:
          rosterRegisterAsParticipant.value || !!c.suggestedRegisterAsParticipant || !!c.readyForParticipant
      });
      const label = rosterClientLabel(c);
      rosterAddSuccess.value = res.data?.registeredAsParticipant
        ? `${label} enrolled as participant.`
        : `${label} registered for this event.`;
    }
    if (detail.value?.skillsGroup) {
      rosterAddSuccess.value = `${rosterClientLabel(c)} added to roster.`;
    }
    rosterAddResults.value = rosterAddResults.value.filter((r) => r.clientId !== c.clientId);
    rosterAddQuery.value = '';
    if (detail.value?.skillsGroup) await loadDetail();
    await loadGenericParticipants();
    await loadScheduleParticipants();
  } catch (e) {
    rosterAddError.value = e.response?.data?.error?.message || e.message || 'Could not add client';
  } finally {
    rosterAddSavingId.value = null;
  }
}

async function loadGenericParticipants() {
  const aid = eventBillingAgencyId.value;
  const eid = eventId.value;
  if (!aid || !eid) {
    genericParticipants.value = [];
    genericParticipantsError.value = '';
    genericParticipantsLoading.value = false;
    return;
  }
  genericParticipantsLoading.value = true;
  genericParticipantsError.value = '';
  try {
    const res = await api.get(`/company-events/${eid}/clients`, {
      params: { agencyId: aid, includeWorkflow: 1, status: participantStatusFilter.value },
      skipGlobalLoading: true
    });
    genericParticipants.value = Array.isArray(res.data?.clients) ? res.data.clients : [];
    if (res.data?.counts && typeof res.data.counts === 'object') {
      participantCounts.value = {
        all: Number(res.data.counts.all || 0),
        registrants: Number(res.data.counts.registrants || 0),
        participants: Number(res.data.counts.participants || 0),
        denied: Number(res.data.counts.denied || 0)
      };
    }
    participantGroupCounts.value = Array.isArray(res.data?.participantGroupCounts)
      ? res.data.participantGroupCounts
      : [];
    // Provider dropdown options for the Participants panel
    loadParticipantProviders();
  } catch (e) {
    genericParticipants.value = [];
    genericParticipantsError.value = e.response?.data?.error?.message || e.message || 'Could not load participants';
  } finally {
    genericParticipantsLoading.value = false;
  }
}

async function loadScheduleParticipants() {
  const aid = eventBillingAgencyId.value;
  const eid = eventId.value;
  if (!aid || !eid) {
    scheduleParticipants.value = [];
    scheduleParticipantsError.value = '';
    scheduleParticipantsLoading.value = false;
    return;
  }
  scheduleParticipantsLoading.value = true;
  scheduleParticipantsError.value = '';
  try {
    const res = await api.get(`/company-events/${eid}/clients`, {
      params: { agencyId: aid, includeWorkflow: 1, status: 'participants' },
      skipGlobalLoading: true
    });
    scheduleParticipants.value = Array.isArray(res.data?.clients) ? res.data.clients : [];
  } catch (e) {
    scheduleParticipants.value = [];
    scheduleParticipantsError.value = e.response?.data?.error?.message || e.message || 'Could not load schedule participants';
  } finally {
    scheduleParticipantsLoading.value = false;
  }
}

function setParticipantStatusFilter(next) {
  const v = String(next || 'all').toLowerCase();
  const norm = v === 'registrants' || v === 'registrant'
    ? 'registrants'
    : v === 'participants' || v === 'participant'
      ? 'participants'
      : 'registrants';
  if (participantStatusFilter.value === norm) return;
  participantStatusFilter.value = norm;
  loadGenericParticipants();
}

/**
 * Per-group breakdown for the Participants card.
 * Backend already filters to participant rows (TP complete, not denied) and joins
 * staffing-group assignments. We pass the array through unchanged so the chip row
 * can render `<label> · <session> = <count>`. When fewer than two groups are
 * populated we hide the breakdown entirely (handled in the template).
 */
const participantGroupBreakdown = computed(() => {
  const arr = Array.isArray(participantGroupCounts.value) ? participantGroupCounts.value : [];
  return arr.filter((g) => Number(g?.count || 0) > 0);
});


async function loadParticipantProviders() {
  const aid = eventBillingAgencyId.value;
  const eid = eventId.value;
  if (!aid || !eid || detail.value?.skillsGroup) {
    participantProviders.value = [];
    participantProvidersError.value = '';
    participantProvidersLoading.value = false;
    return;
  }
  if (participantProvidersLoading.value) return;
  participantProvidersLoading.value = true;
  participantProvidersError.value = '';
  try {
    const res = await api.get(`/company-events/${eid}/provider-options`, {
      params: { agencyId: aid },
      skipGlobalLoading: true
    });
    participantProviders.value = Array.isArray(res.data?.providers) ? res.data.providers : [];
  } catch (e) {
    participantProviders.value = [];
    participantProvidersError.value = e.response?.data?.error?.message || e.message || 'Could not load providers';
  } finally {
    participantProvidersLoading.value = false;
  }
}

const staffingEnabled = computed(() => !!detail.value?.event?.staffingConfig?.enabled && !detail.value?.skillsGroup);
const staffingConfig = computed(() => (detail.value?.event?.staffingConfig && typeof detail.value.event.staffingConfig === 'object'
  ? detail.value.event.staffingConfig
  : null));
const staffingSessions = computed(() => (Array.isArray(staffingSummary.value?.sessions) ? staffingSummary.value.sessions : []));
const staffingActiveSession = computed(() =>
  staffingSessions.value.find((s) => Number(s.sessionDateId) === Number(staffingActiveSessionDateId.value)) || null
);

function ensureDefaultStaffingSessionSelected() {
  if (staffingActiveSessionDateId.value) return;
  const first = Number(staffingSessions.value?.[0]?.sessionDateId || 0);
  if (first) staffingActiveSessionDateId.value = first;
}

async function loadStaffingSummary() {
  const aid = eventBillingAgencyId.value;
  const eid = eventId.value;
  if (!aid || !eid || !staffingEnabled.value) {
    staffingSummary.value = null;
    staffingSummaryError.value = '';
    staffingSummaryLoading.value = false;
    return;
  }
  staffingSummaryLoading.value = true;
  staffingSummaryError.value = '';
  try {
    const res = await api.get(`/company-events/${eid}/session-staffing-summary`, {
      params: { agencyId: aid },
      skipGlobalLoading: true
    });
    staffingSummary.value = res.data || null;
    ensureDefaultStaffingSessionSelected();
  } catch (e) {
    staffingSummary.value = null;
    staffingSummaryError.value = e.response?.data?.error?.message || e.message || 'Could not load staffing summary';
  } finally {
    staffingSummaryLoading.value = false;
  }
}

async function loadStaffingSessionGroups() {
  const aid = eventBillingAgencyId.value;
  const eid = eventId.value;
  const sid = Number(staffingActiveSessionDateId.value || 0);
  if (!aid || !eid || !sid || !staffingEnabled.value) {
    staffingSessionGroups.value = [];
    staffingSessionGroupsError.value = '';
    staffingSessionGroupsLoading.value = false;
    return;
  }
  staffingSessionGroupsLoading.value = true;
  staffingSessionGroupsError.value = '';
  try {
    const res = await api.get(`/company-events/${eid}/session-groups`, {
      params: { agencyId: aid, sessionDateId: sid },
      skipGlobalLoading: true
    });
    staffingSessionGroups.value = Array.isArray(res.data?.groups) ? res.data.groups : [];
  } catch (e) {
    staffingSessionGroups.value = [];
    staffingSessionGroupsError.value = e.response?.data?.error?.message || e.message || 'Could not load session groups';
  } finally {
    staffingSessionGroupsLoading.value = false;
  }
}

async function createStaffingSessionGroup() {
  const aid = eventBillingAgencyId.value;
  const eid = eventId.value;
  const sid = Number(staffingActiveSessionDateId.value || 0);
  const label = String(staffingNewGroupLabel.value || '').trim();
  if (!aid || !eid || !sid || !label || staffingNewGroupSaving.value) return;
  staffingNewGroupSaving.value = true;
  staffingNewGroupError.value = '';
  try {
    const groups = [
      ...(Array.isArray(staffingSessionGroups.value) ? staffingSessionGroups.value : []).map((g) => ({
        id: Number(g.id || 0) || undefined,
        label: String(g.label || '').trim(),
        ageMin: g.ageMin ?? null,
        ageMax: g.ageMax ?? null
      })),
      { label }
    ];
    await api.post(`/company-events/${eid}/session-groups`, {
      agencyId: aid,
      sessionDateId: sid,
      groups
    }, { skipGlobalLoading: true });
    staffingNewGroupLabel.value = '';
    await Promise.all([loadStaffingSessionGroups(), loadStaffingSummary()]);
  } catch (e) {
    staffingNewGroupError.value = e.response?.data?.error?.message || e.message || 'Could not add group';
  } finally {
    staffingNewGroupSaving.value = false;
  }
}

async function loadStaffingSessionAssignments() {
  const aid = eventBillingAgencyId.value;
  const eid = eventId.value;
  const sid = Number(staffingActiveSessionDateId.value || 0);
  if (!aid || !eid || !sid || !staffingEnabled.value) {
    staffingSessionAssignments.value = {};
    staffingSessionAssignmentsError.value = '';
    staffingSessionAssignmentsLoading.value = false;
    return;
  }
  staffingSessionAssignmentsLoading.value = true;
  staffingSessionAssignmentsError.value = '';
  try {
    const res = await api.get(`/company-events/${eid}/session-client-group-assignments`, {
      params: { agencyId: aid, sessionDateId: sid },
      skipGlobalLoading: true
    });
    const rows = Array.isArray(res.data?.assignments) ? res.data.assignments : [];
    const map = {};
    for (const r of rows) {
      const cid = Number(r.clientId || 0);
      if (!cid) continue;
      map[cid] = r.groupId == null ? null : Number(r.groupId);
    }
    staffingSessionAssignments.value = map;
  } catch (e) {
    staffingSessionAssignments.value = {};
    staffingSessionAssignmentsError.value = e.response?.data?.error?.message || e.message || 'Could not load group assignments';
  } finally {
    staffingSessionAssignmentsLoading.value = false;
  }
}

async function loadStaffingSessionRequests() {
  const aid = eventBillingAgencyId.value;
  const eid = eventId.value;
  const sid = Number(staffingActiveSessionDateId.value || 0);
  if (!aid || !eid || !sid || !staffingEnabled.value) {
    staffingSessionRequests.value = [];
    staffingSessionRequestsError.value = '';
    staffingSessionRequestsLoading.value = false;
    return;
  }
  staffingSessionRequestsLoading.value = true;
  staffingSessionRequestsError.value = '';
  try {
    const res = await api.get(`/company-events/${eid}/session-requests`, {
      params: { agencyId: aid, sessionDateId: sid },
      skipGlobalLoading: true
    });
    staffingSessionRequests.value = Array.isArray(res.data?.requests) ? res.data.requests : [];
  } catch (e) {
    staffingSessionRequests.value = [];
    staffingSessionRequestsError.value = e.response?.data?.error?.message || e.message || 'Could not load session requests';
  } finally {
    staffingSessionRequestsLoading.value = false;
  }
}

async function refreshStaffingForActiveSession() {
  if (!staffingEnabled.value) return;
  await Promise.all([
    loadStaffingSummary(),
    loadStaffingSessionGroups(),
    loadStaffingSessionAssignments(),
    loadStaffingSessionRequests()
  ]);
}

function participantGroupId(clientId) {
  const cid = Number(clientId || 0);
  if (!cid) return null;
  const map = staffingSessionAssignments.value || {};
  return Object.prototype.hasOwnProperty.call(map, cid) ? map[cid] : null;
}

function participantAgeDisplay(c) {
  if (c?.ageYears != null && Number.isFinite(Number(c.ageYears))) return String(c.ageYears);
  const dob = c?.dateOfBirth ? String(c.dateOfBirth).slice(0, 10) : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    const birth = new Date(`${dob}T12:00:00Z`);
    if (Number.isFinite(birth.getTime())) {
      const today = new Date();
      let age = today.getUTCFullYear() - birth.getUTCFullYear();
      const m = today.getUTCMonth() - birth.getUTCMonth();
      if (m < 0 || (m === 0 && today.getUTCDate() < birth.getUTCDate())) age -= 1;
      if (age >= 0 && age < 130) return String(age);
    }
  }
  return '—';
}

function participantGroupDisplay(c) {
  const cid = Number(c?.clientId || 0);
  const gid = participantGroupId(cid);
  if (gid && Array.isArray(staffingSessionGroups.value) && staffingSessionGroups.value.length) {
    const g = staffingSessionGroups.value.find((x) => Number(x.id) === Number(gid));
    if (g) return groupDisplayLabel(g);
  }
  const fromApi = String(c?.groupDisplay || '').trim();
  if (fromApi) return fromApi;
  const assignments = Array.isArray(c?.groupAssignments) ? c.groupAssignments : [];
  if (assignments.length) {
    return assignments
      .map((g) => {
        const label = String(g?.label || '').trim() || (g?.groupId ? `Group ${g.groupId}` : 'Group');
        const parts = [label];
        if (g?.sessionDate) {
          const d = new Date(g.sessionDate);
          if (Number.isFinite(d.getTime())) {
            parts.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
          }
        } else if (g?.sessionLabel) {
          parts.push(String(g.sessionLabel).trim());
        }
        return parts.join(' · ');
      })
      .join('; ');
  }
  return '—';
}

function isIntakeAccepted(c) {
  const outcome = String(c?.intakeOutcome || '').trim().toLowerCase();
  if (outcome === 'accepted') return true;
  return !outcome && !!c?.intakeComplete;
}

function isParticipantTpPending(c) {
  return isIntakeAccepted(c) && !c?.treatmentPlanComplete;
}

function participantStatusLabel(c) {
  if (c?.intakeOutcome === 'denied') return 'Denied';
  if (isParticipantTpPending(c)) return 'Participant — TP due';
  if (isIntakeAccepted(c)) return 'Participant';
  return 'Registrant';
}

function groupDisplayLabel(g) {
  const min = g?.ageMin != null ? Number(g.ageMin) : null;
  const max = g?.ageMax != null ? Number(g.ageMax) : null;
  const range = (min != null || max != null)
    ? `${min != null ? min : '—'}–${max != null ? max : '—'}`
    : '';
  return `${String(g?.label || '').trim() || 'Group'}${range ? ` · ages ${range}` : ''}`;
}

const staffingParticipantGroups = computed(() => {
  const groups = Array.isArray(staffingSessionGroups.value) ? staffingSessionGroups.value : [];
  const roster = Array.isArray(genericParticipants.value) ? genericParticipants.value : [];
  const byGroup = groups.map((g) => ({
    ...g,
    participants: roster.filter((c) => participantGroupId(c.clientId) === Number(g.id))
  }));
  const unassigned = roster.filter((c) => {
    const gid = participantGroupId(c.clientId);
    return gid == null || gid === 0;
  });
  return { byGroup, unassigned };
});

const scheduleParticipantGroups = computed(() => {
  const groups = Array.isArray(staffingSessionGroups.value) ? staffingSessionGroups.value : [];
  const roster = Array.isArray(scheduleParticipants.value) ? scheduleParticipants.value : [];
  const byGroup = groups.map((g) => ({
    ...g,
    participants: roster.filter((c) => participantGroupId(c.clientId) === Number(g.id))
  }));
  const unassigned = roster.filter((c) => {
    const gid = participantGroupId(c.clientId);
    return gid == null || gid === 0;
  });
  return { byGroup, unassigned };
});

const scheduleParticipantGroupCards = computed(() => {
  const cards = scheduleParticipantGroups.value.byGroup.map((g) => ({
    key: `group-${g.id}`,
    label: groupDisplayLabel(g),
    participants: g.participants || []
  }));
  if (scheduleParticipantGroups.value.unassigned.length) {
    cards.unshift({
      key: 'unassigned',
      label: 'Unassigned',
      participants: scheduleParticipantGroups.value.unassigned
    });
  }
  return cards;
});

function participantConfirmationLabel(row) {
  const v = String(row?.confirmationStatus || 'pending').toLowerCase();
  if (v === 'yes') return 'Confirmed';
  if (v === 'no') return 'Not attending';
  return 'Not yet confirmed';
}

function providerListNames(providers) {
  return (Array.isArray(providers) ? providers : [])
    .map((p) => p?.name || `${p?.firstName || ''} ${p?.lastName || ''}`.trim())
    .filter(Boolean)
    .join(', ');
}

async function assignParticipantToGroup(row, rawGroupId) {
  const aid = eventBillingAgencyId.value;
  const eid = eventId.value;
  const sid = Number(staffingActiveSessionDateId.value || 0);
  const clientId = Number(row?.clientId || 0);
  const groupId = rawGroupId === '' || rawGroupId == null ? 0 : Number(rawGroupId);
  if (!aid || !eid || !sid || !clientId) return;
  try {
    await api.post(
      `/company-events/${eid}/session-groups/${groupId || 0}/assign-client`,
      { agencyId: aid, sessionDateId: sid, clientId },
      { skipGlobalLoading: true }
    );
    await loadStaffingSessionAssignments();
    await loadStaffingSummary();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Could not assign group');
  }
}

async function approveSessionRequest(reqRow) {
  const aid = eventBillingAgencyId.value;
  const eid = eventId.value;
  const rid = Number(reqRow?.id || 0);
  if (!aid || !eid || !rid) return;
  staffingRequestDecisionSavingId.value = rid;
  try {
    await api.post(
      `/company-events/${eid}/session-requests/${rid}/approve`,
      { agencyId: aid },
      { skipGlobalLoading: true }
    );
    await refreshStaffingForActiveSession();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Could not approve request');
  } finally {
    staffingRequestDecisionSavingId.value = 0;
  }
}

async function denySessionRequest(reqRow) {
  const aid = eventBillingAgencyId.value;
  const eid = eventId.value;
  const rid = Number(reqRow?.id || 0);
  if (!aid || !eid || !rid) return;
  staffingRequestDecisionSavingId.value = rid;
  try {
    await api.post(
      `/company-events/${eid}/session-requests/${rid}/deny`,
      { agencyId: aid },
      { skipGlobalLoading: true }
    );
    await refreshStaffingForActiveSession();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Could not deny request');
  } finally {
    staffingRequestDecisionSavingId.value = 0;
  }
}

const isMyParticipant = (row) => {
  const mine = Number(authStore.user?.id || 0);
  return mine > 0 && Number(row?.assignedProviderUserId || 0) === mine;
};

/** Skills-group roster client: trust backend `isAssignedToViewer` first, fall back to id compare. */
const isMyRosterClient = (c) => {
  if (!c) return false;
  if (c.isAssignedToViewer === true) return true;
  const mine = Number(authStore.user?.id || 0);
  return mine > 0 && Number(c?.assignedProviderUserId || 0) === mine;
};

const formatWorkflowTooltip = (label, at, by) => {
  if (!at && !by) return label;
  const d = at ? new Date(at) : null;
  const dateStr = d && Number.isFinite(d.getTime()) ? d.toLocaleString() : null;
  return `${label}${dateStr ? ` · ${dateStr}` : ''}${by ? ` · ${by}` : ''}`;
};

/** Short "Mar 14, 2026" style for the Registered column on the registrants table. */
function formatRegisteredDate(raw) {
  if (!raw) return '—';
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function formatRegisteredTooltip(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return '';
  return `Registered ${d.toLocaleString()}`;
}
const intakeOutcomeLabel = (outcome) => {
  if (outcome === 'accepted') return 'Accepted';
  if (outcome === 'denied') return 'Denied';
  return 'Needed';
};

async function patchParticipantWorkflow(row, patch) {
  const aid = eventBillingAgencyId.value;
  const eid = eventId.value;
  const clientId = Number(row?.clientId || 0);
  if (!aid || !eid || !clientId) return;
  participantWorkflowSavingClientId.value = clientId;
  setParticipantRowSaveStatus(clientId, 'saving');
  try {
    await api.patch(`/company-events/${eid}/clients/${clientId}/workflow`, {
      agencyId: aid,
      ...patch
    });
    setParticipantRowSaveStatus(clientId, 'saved', 'Saved');
    await loadGenericParticipants();
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message || 'Could not update participant';
    setParticipantRowSaveStatus(clientId, 'error', msg);
    window.alert(msg);
  } finally {
    participantWorkflowSavingClientId.value = 0;
  }
}

async function toggleParticipantIntake(row) {
  const next = !row?.intakeComplete;
  await patchParticipantWorkflow(row, { intakeComplete: next });
}

/**
 * Family attendance confirmation: 'pending' | 'yes' | 'no'.
 * Currently every change is a coordinator/admin-driven override (the SMS/email
 * automation that will set this automatically isn't built yet).
 */
async function setParticipantConfirmation(row, status) {
  const norm = status === 'yes' || status === 'no' || status === 'pending' ? status : 'pending';
  if ((row?.confirmationStatus || 'pending') === norm) return;
  await patchParticipantWorkflow(row, { confirmationStatus: norm });
}

/**
 * De-select an intake safety flag (eloping or extra-support). Admin-only on the
 * server side too — non-admins see the checkbox as read-only and the API will
 * reject the PATCH if they try to bypass it.
 */
async function setParticipantSafetyFlag(row, field, next) {
  const isAdmin = roleLower.value === 'admin' || roleLower.value === 'super_admin';
  if (!isAdmin) {
    window.alert('Only an admin can change this flag.');
    return;
  }
  if (field !== 'elopingFlag' && field !== 'extraAssistanceFlag') return;
  // Toggle: if already set true and admin clicks → null (remove). If currently
  // null/false, the admin would normally not be re-flagging; only "de-select"
  // is in scope per the user's spec, so we cap to true → null.
  const cur = row?.[field];
  const nextVal = next === undefined ? (cur ? null : null) : next;
  await patchParticipantWorkflow(row, { [field]: nextVal });
}

const isAdminViewer = computed(
  () => roleLower.value === 'admin' || roleLower.value === 'super_admin'
);

/** Tri-state intake outcome: 'accepted' | 'denied' | null (Needed) */
async function setParticipantIntakeOutcome(row, outcome) {
  const norm = outcome === 'accepted' || outcome === 'denied' ? outcome : null;
  // No-op when picking the same state again
  const cur = row?.intakeOutcome || null;
  if (cur === norm) return;
  // Resetting to "Needed" while TP is already complete is rejected by the backend;
  // surface a friendlier confirmation so the coordinator knows what's about to happen.
  if (norm === null && row?.treatmentPlanComplete) {
    if (!window.confirm('This client already has a completed treatment plan. Reset intake anyway?')) return;
  }
  await patchParticipantWorkflow(row, { intakeOutcome: norm });
  if (norm === 'accepted') {
    setParticipantStatusFilter('participants');
  }
}

async function toggleParticipantTreatmentPlan(row) {
  const next = !row?.treatmentPlanComplete;
  await patchParticipantWorkflow(row, { treatmentPlanComplete: next });
}

async function changeParticipantProvider(row, rawId) {
  const id = rawId === '' ? null : Number.parseInt(String(rawId), 10);
  await patchParticipantWorkflow(row, { assignedProviderUserId: Number.isFinite(id) ? id : null });
}

/**
 * Explicit "Save" — re-sends the row's current state to both endpoints. Mostly a confirmation
 * affordance for users who don't trust the per-field autosave (and a graceful retry path
 * after an error). Notes go through the notes endpoint; workflow fields through workflow.
 */
async function saveParticipantRow(row) {
  const aid = eventBillingAgencyId.value;
  const eid = eventId.value;
  const clientId = Number(row?.clientId || 0);
  if (!aid || !eid || !clientId) return;
  participantWorkflowSavingClientId.value = clientId;
  setParticipantRowSaveStatus(clientId, 'saving');
  try {
    const payload = {
      agencyId: aid,
      assignedProviderUserId: row?.assignedProviderUserId ?? null,
      intakeComplete: !!row?.intakeComplete,
      treatmentPlanComplete: !!row?.treatmentPlanComplete,
      intakeOutcome: row?.intakeOutcome ?? null,
      confirmationStatus: row?.confirmationStatus || 'pending'
    };
    // Only admins can change safety flags; skip them for everyone else so the
    // explicit Save button doesn't trip the 403.
    if (isAdminViewer.value) {
      if (row?.elopingFlag !== undefined) payload.elopingFlag = row.elopingFlag;
      if (row?.extraAssistanceFlag !== undefined) payload.extraAssistanceFlag = row.extraAssistanceFlag;
    }
    await api.patch(`/company-events/${eid}/clients/${clientId}/workflow`, payload);
    await api.patch(`/company-events/${eid}/clients/${clientId}`, {
      agencyId: aid,
      notes: row?.notes ?? null
    });
    setParticipantRowSaveStatus(clientId, 'saved', 'Saved');
    await loadGenericParticipants();
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message || 'Could not save row';
    setParticipantRowSaveStatus(clientId, 'error', msg);
    window.alert(msg);
  } finally {
    participantWorkflowSavingClientId.value = 0;
  }
}

async function saveParticipantNotes(row) {
  const aid = eventBillingAgencyId.value;
  const eid = eventId.value;
  const clientId = Number(row?.clientId || 0);
  if (!aid || !eid || !clientId) return;
  participantNotesSavingClientId.value = clientId;
  setParticipantRowSaveStatus(clientId, 'saving');
  try {
    await api.patch(`/company-events/${eid}/clients/${clientId}`, {
      agencyId: aid,
      notes: row?.notes ?? null
    });
    setParticipantRowSaveStatus(clientId, 'saved', 'Saved');
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message || 'Could not save notes';
    setParticipantRowSaveStatus(clientId, 'error', msg);
    window.alert(msg);
  } finally {
    participantNotesSavingClientId.value = 0;
  }
}

async function removeGenericParticipant(row) {
  const aid = eventBillingAgencyId.value;
  const eid = eventId.value;
  const clientId = Number(row?.clientId || 0);
  if (!aid || !eid || !clientId) return;
  const label = row?.fullName || row?.initials || row?.identifierCode || `Client ${clientId}`;
  if (!window.confirm(`Remove ${label} from this event?`)) return;
  try {
    await api.delete(`/company-events/${eid}/clients/${clientId}`, {
      params: { agencyId: aid },
      skipGlobalLoading: true
    });
    await loadGenericParticipants();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Could not remove participant');
  }
}

const chatThreadId = ref(null);
const chatLoading = ref(false);
const chatError = ref('');
const chatMessages = ref([]);
const chatDraft = ref('');
const chatSending = ref(false);

const providerAttendance = ref([]);
const providerAttendancePaired = ref([]);
const clientAttendance = ref([]);
const kioskAttendanceClients = ref([]);
const kioskAttendanceEmployees = ref([]);
const kioskAttendanceDates = ref([]);
const kioskAttDateFilter = ref('');
const kioskReleaseDetailOpen = ref(false);
const kioskReleaseDetailRow = ref(null);
const kioskReleasePhotoUrl = ref('');
const kioskReleasePhotoLoading = ref(false);
const kioskReleasePhotoError = ref('');
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
const learningInsightsClientId = ref(0);
const learningInsightsLoading = ref(false);
const learningInsightsError = ref('');
const learningInsightsDomains = ref([]);
const learningInsightsGoals = ref([]);
const learningInsightsRecommendations = ref([]);
const learningCatalogLoading = ref(false);
const learningCatalogError = ref('');
const learningCatalogDomains = ref([]);
const learningCatalogSkills = ref([]);
const learningGoalFormOpen = ref(false);
const learningGoalSaving = ref(false);
const learningGoalFormError = ref('');
const learningGoalForm = reactive({
  goalId: null,
  domainId: 0,
  skillId: 0,
  measurementType: 'numeric',
  baselineValue: null,
  targetValue: null,
  baselineRubricLevel: '',
  targetRubricLevel: '',
  startDate: '',
  targetDate: '',
  notes: ''
});

const clientAttSelectedCount = computed(() => clientAttSelectedClientIds.value.length);
const kioskClientRows = computed(() => kioskAttendanceClients.value || []);
const kioskEmployeeRowsFiltered = computed(() => {
  const rows = kioskAttendanceEmployees.value || [];
  const caps = viewerCaps.value;
  if (caps.canManageCompanyEvent || caps.canManageTeamSchedules) return rows;
  if (caps.isAssignedProvider) {
    const mine = Number(authStore.user?.id || 0);
    if (mine > 0) return rows.filter((r) => Number(r.userId) === mine);
  }
  return rows;
});
const canManageLearningGoals = computed(
  () => viewerCaps.value.isAssignedProvider || viewerCaps.value.canManageTeamSchedules || viewerCaps.value.canManageCompanyEvent
);
const filteredLearningSkills = computed(() => {
  const did = Number(learningGoalForm.domainId || 0);
  if (!did) return [];
  return (learningCatalogSkills.value || []).filter((s) => Number(s.domainId) === did);
});

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

const todayYmd = () => new Date().toISOString().slice(0, 10);

const resetLearningGoalForm = () => {
  const firstDomain = Number(learningCatalogDomains.value?.[0]?.id || 0);
  const firstSkill = Number(
    (learningCatalogSkills.value || []).find((s) => Number(s.domainId) === firstDomain)?.id || 0
  );
  learningGoalForm.goalId = null;
  learningGoalForm.domainId = firstDomain;
  learningGoalForm.skillId = firstSkill;
  learningGoalForm.measurementType = 'numeric';
  learningGoalForm.baselineValue = null;
  learningGoalForm.targetValue = null;
  learningGoalForm.baselineRubricLevel = '';
  learningGoalForm.targetRubricLevel = '';
  learningGoalForm.startDate = todayYmd();
  learningGoalForm.targetDate = todayYmd();
  learningGoalForm.notes = '';
  learningGoalFormError.value = '';
};

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
  if (!eventBillingAgencyId.value || !eventId.value) return;
  api.get(`/skill-builders/events/${eventId.value}/attendance/providers/export.csv`, {
    params: { agencyId: eventBillingAgencyId.value },
    responseType: 'blob',
    skipGlobalLoading: true
  }).then((resp) => {
    const blob = new Blob([resp.data], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skill-builders-event-${eventId.value}-provider-time.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }).catch(() => {});
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
  const title = detail.value?.event?.title || eventNounFallback.value;
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

async function copyRegistrationLink() {
  const url = registrationShareHref.value;
  if (!url) return;
  try {
    const absolute = url.startsWith('/')
      ? `${String(window.location.origin || '').replace(/\/$/, '')}${url}`
      : url;
    await navigator.clipboard.writeText(absolute);
    copyHint.value = 'Registration link copied.';
  } catch {
    copyHint.value = 'Could not copy registration link.';
  } finally {
    setTimeout(() => {
      copyHint.value = '';
    }, 2200);
  }
}

async function copyRegistrationShareBlurb() {
  const d = detail.value || {};
  const e = d.event || {};
  const url = registrationShareHref.value;
  if (!url) return;
  const absolute = url.startsWith('/')
    ? `${String(window.location.origin || '').replace(/\/$/, '')}${url}`
    : url;
  const lines = [
    String(e.title || 'Program registration').trim() || 'Program registration',
    registrationRateLines.value.length ? `Rates: ${registrationRateLines.value.join(' · ')}` : '',
    `Registration link: ${absolute}`
  ].filter(Boolean);
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    copyHint.value = 'Registration share text copied.';
  } catch {
    copyHint.value = 'Could not copy registration share text.';
  } finally {
    setTimeout(() => {
      copyHint.value = '';
    }, 2200);
  }
}

async function copyIntakeFormLink() {
  const url = intakeFormUrl.value;
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    copyHint.value = 'Digital form link copied.';
  } catch {
    copyHint.value = 'Could not copy digital form link.';
  } finally {
    setTimeout(() => {
      copyHint.value = '';
    }, 2200);
  }
}

async function loadAttendance() {
  if (!eventBillingAgencyId.value || !eventId.value) return;
  try {
    const [pr, cr] = await Promise.all([
      api.get(`/skill-builders/events/${eventId.value}/attendance/providers`, {
        params: { agencyId: eventBillingAgencyId.value },
        skipGlobalLoading: true
      }),
      api.get(`/skill-builders/events/${eventId.value}/attendance/clients`, {
        params: { agencyId: eventBillingAgencyId.value },
        skipGlobalLoading: true
      })
    ]);
    providerAttendance.value = Array.isArray(pr.data?.punches) ? pr.data.punches : [];
    providerAttendancePaired.value = Array.isArray(pr.data?.paired)
      ? pr.data.paired
      : (Array.isArray(pr.data?.sessions) ? pr.data.sessions : []);
    clientAttendance.value = Array.isArray(cr.data?.attendance) ? cr.data.attendance : [];
  } catch {
    providerAttendance.value = [];
    providerAttendancePaired.value = [];
    clientAttendance.value = [];
  }
  await loadKioskAttendance();
}

async function loadKioskAttendance() {
  if (!eventBillingAgencyId.value || !eventId.value) return;
  try {
    const params = { agencyId: eventBillingAgencyId.value, skipGlobalLoading: true };
    if (kioskAttDateFilter.value) params.kioskDate = kioskAttDateFilter.value;
    const res = await api.get(`/skill-builders/events/${eventId.value}/attendance/kiosk`, { params });
    kioskAttendanceClients.value = Array.isArray(res.data?.clientRows) ? res.data.clientRows : [];
    kioskAttendanceEmployees.value = Array.isArray(res.data?.employeeRows) ? res.data.employeeRows : [];
    kioskAttendanceDates.value = Array.isArray(res.data?.dates) ? res.data.dates : [];
  } catch {
    kioskAttendanceClients.value = [];
    kioskAttendanceEmployees.value = [];
    kioskAttendanceDates.value = [];
  }
}

// --- Attendance planning (per-date status shown on the kiosk) ---
const planDate = ref('');
const planSessionDates = ref([]);
const planAllStatuses = ref([]);
const planDrafts = ref({});
const planLoading = ref(false);
const planError = ref('');
const planSavingClientId = ref(0);
const attendanceResetLoading = ref(false);
const attendanceResetMessage = ref('');

const planParticipants = computed(() =>
  (genericParticipants.value || []).map((c) => ({
    clientId: Number(c.clientId),
    name: c.fullName || c.initials || c.identifierCode || `Client ${c.clientId}`,
    identifierCode: c.identifierCode || null
  }))
);

function planStatusForClient(clientId, ymd) {
  return planAllStatuses.value.find(
    (s) => Number(s.clientId) === Number(clientId) && String(s.sessionDate).slice(0, 10) === ymd
  ) || null;
}

function rebuildPlanDrafts() {
  const ymd = planDate.value;
  const next = {};
  for (const p of planParticipants.value) {
    const existing = ymd ? planStatusForClient(p.clientId, ymd) : null;
    next[p.clientId] = {
      status: existing?.status || '',
      time: existing?.expectedArrivalTime || '',
      note: existing?.note || ''
    };
  }
  planDrafts.value = next;
}

async function loadAttendancePlan() {
  if (!eventBillingAgencyId.value || !eventId.value) return;
  if (!viewerCaps.value.canManageCompanyEvent) return;
  planLoading.value = true;
  planError.value = '';
  try {
    const res = await api.get(`/company-events/${eventId.value}/attendance-status`, {
      params: { agencyId: eventBillingAgencyId.value },
      skipGlobalLoading: true
    });
    const today = String(res.data?.todayYmd || todayYmd()).slice(0, 10);
    const dates = Array.isArray(res.data?.sessionDates) ? res.data.sessionDates : [];
    planSessionDates.value = dates
      .map((d) => String(d.sessionDate).slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today);
    planAllStatuses.value = Array.isArray(res.data?.statuses) ? res.data.statuses : [];
    if (!planDate.value || !planSessionDates.value.includes(planDate.value)) {
      planDate.value = planSessionDates.value[0] || '';
    }
    rebuildPlanDrafts();
  } catch (e) {
    planError.value = e.response?.data?.error?.message || e.message || 'Could not load attendance planning';
    planSessionDates.value = [];
    planAllStatuses.value = [];
  } finally {
    planLoading.value = false;
  }
}

async function savePlanRow(client) {
  if (!eventBillingAgencyId.value || !eventId.value || !planDate.value) return;
  const draft = planDrafts.value[client.clientId] || { status: '', time: '', note: '' };
  const status = draft.status || null;
  // "removed" spans future dates; clearing a previously-removed client should
  // also clear those future rows so the undo is complete.
  const wasRemoved = planStatusForClient(client.clientId, planDate.value)?.status === 'removed';
  const applyToFuture = status === 'removed' || (status === null && wasRemoved);
  planSavingClientId.value = client.clientId;
  planError.value = '';
  try {
    await api.put(
      `/company-events/${eventId.value}/clients/${client.clientId}/attendance-status`,
      {
        agencyId: eventBillingAgencyId.value,
        sessionDate: planDate.value,
        status,
        expectedArrivalTime: status === 'late' ? (draft.time || null) : null,
        note: draft.note || null,
        applyToFuture
      },
      { skipGlobalLoading: true }
    );
    await loadAttendancePlan();
  } catch (e) {
    planError.value = e.response?.data?.error?.message || e.message || 'Could not save status';
  } finally {
    planSavingClientId.value = 0;
  }
}

async function confirmResetAttendanceDay(sessionDate) {
  const ymd = String(sessionDate || '').slice(0, 10);
  if (!ymd || !eventBillingAgencyId.value || !eventId.value) return;
  if (!window.confirm(
    `Reset all attendance for ${formatKioskAttDate(ymd)}?\n\nThis clears kiosk check-ins, releases, and planning notes for that day. This cannot be undone.`
  )) return;

  attendanceResetLoading.value = true;
  planError.value = '';
  attendanceResetMessage.value = '';
  try {
    const res = await api.post(
      `/company-events/${eventId.value}/attendance-reset`,
      { agencyId: eventBillingAgencyId.value, sessionDate: ymd },
      { skipGlobalLoading: true }
    );
    const n = (res.data?.checkinsDeleted || 0) + (res.data?.releasesDeleted || 0) + (res.data?.statusesDeleted || 0);
    attendanceResetMessage.value = n
      ? `Reset ${formatKioskAttDate(ymd)} (${n} record${n === 1 ? '' : 's'} cleared).`
      : `Reset ${formatKioskAttDate(ymd)} (nothing to clear).`;
    await loadAttendancePlan();
    await loadKioskAttendance();
  } catch (e) {
    planError.value = e.response?.data?.error?.message || e.message || 'Could not reset attendance for this day';
  } finally {
    attendanceResetLoading.value = false;
  }
}

watch(planDate, () => rebuildPlanDrafts());
watch(genericParticipants, () => rebuildPlanDrafts());

function formatKioskAttDate(ymd) {
  const s = String(ymd || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '—';
  try {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return s;
  }
}

function kioskClientAvatarNames(row) {
  const name = String(row?.clientName || '').trim();
  if (name) {
    const parts = name.split(/\s+/);
    return { firstName: parts[0] || '?', lastName: parts.slice(1).join(' ') || '' };
  }
  const initials = String(row?.clientInitials || '?').trim();
  return { firstName: initials.slice(0, 1) || '?', lastName: initials.slice(1) || '' };
}

function revokeKioskReleasePhotoUrl() {
  if (kioskReleasePhotoUrl.value) {
    try {
      URL.revokeObjectURL(kioskReleasePhotoUrl.value);
    } catch {
      // ignore
    }
    kioskReleasePhotoUrl.value = '';
  }
}

async function openKioskReleaseDetail(row) {
  revokeKioskReleasePhotoUrl();
  kioskReleaseDetailRow.value = row || null;
  kioskReleaseDetailOpen.value = true;
  kioskReleasePhotoError.value = '';
  kioskReleasePhotoLoading.value = false;
  const releaseId = Number(row?.release?.id || 0);
  if (!releaseId || !row?.release?.hasPhoto || !eventBillingAgencyId.value || !eventId.value) return;
  kioskReleasePhotoLoading.value = true;
  try {
    const res = await api.get(
      `/skill-builders/events/${eventId.value}/attendance/kiosk/releases/${releaseId}/photo`,
      {
        params: { agencyId: eventBillingAgencyId.value },
        responseType: 'blob',
        skipGlobalLoading: true
      }
    );
    const contentType = res?.headers?.['content-type'] || 'image/jpeg';
    const blob = new Blob([res.data], { type: contentType });
    kioskReleasePhotoUrl.value = URL.createObjectURL(blob);
  } catch (e) {
    kioskReleasePhotoError.value = e.response?.data?.error?.message || e.message || 'Could not load release photo';
  } finally {
    kioskReleasePhotoLoading.value = false;
  }
}

function closeKioskReleaseDetail() {
  kioskReleaseDetailOpen.value = false;
  kioskReleaseDetailRow.value = null;
  revokeKioskReleasePhotoUrl();
  kioskReleasePhotoError.value = '';
  kioskReleasePhotoLoading.value = false;
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

  // Only deep-link to the Skill Builders tab when this event is actually tied to a skills group.
  // Generic program events use the overview tab so non-SB clients aren't routed to a Skill Builders screen.
  const hasSkillsGroup = !!detail.value?.skillsGroup?.id;
  const adminClientsQuery = { clientId: String(cid), tab: hasSkillsGroup ? 'skill-builders' : 'overview' };

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
  if (!eventBillingAgencyId.value || !eventId.value || !clientAttSessionId.value || !clientIds.length) return;
  clientAttSaving.value = true;
  try {
    const sess = sessions.value.find((x) => Number(x.id) === Number(clientAttSessionId.value));
    const base = {
      agencyId: eventBillingAgencyId.value,
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
  if (!eventId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const params = { skipGlobalLoading: true };
    const bid = eventBillingAgencyId.value;
    if (bid > 0) params.agencyId = bid;
    const res = await api.get(`/skill-builders/events/${eventId.value}/detail`, params);
    detail.value = res.data;
    await loadGenericParticipants();
    await loadScheduleParticipants();
    await loadSessions();
    await loadStaffingSummary();
    await Promise.all([
      loadStaffingSessionGroups(),
      loadStaffingSessionAssignments(),
      loadStaffingSessionRequests()
    ]);
    await loadAttendance();
    await loadAttendancePlan();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load';
    detail.value = null;
    genericParticipants.value = [];
    genericParticipantsError.value = '';
    scheduleParticipants.value = [];
    scheduleParticipantsError.value = '';
    sessions.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadLearningInsights() {
  const clientId = Number(learningInsightsClientId.value || 0);
  if (!clientId) {
    learningInsightsDomains.value = [];
    learningInsightsGoals.value = [];
    learningInsightsRecommendations.value = [];
    return;
  }
  learningInsightsLoading.value = true;
  learningInsightsError.value = '';
  try {
    const [domainsRes, goalsRes, recommendationsRes] = await Promise.all([
      api.get(`/learning-progress/students/${clientId}/domains`, { skipGlobalLoading: true }),
      api.get(`/learning-progress/students/${clientId}/goals`, { skipGlobalLoading: true }),
      api.get(`/learning-recommendations/students/${clientId}`, { skipGlobalLoading: true })
    ]);
    learningInsightsDomains.value = Array.isArray(domainsRes.data?.domains) ? domainsRes.data.domains : [];
    learningInsightsGoals.value = Array.isArray(goalsRes.data?.goals) ? goalsRes.data.goals : [];
    learningInsightsRecommendations.value = Array.isArray(recommendationsRes.data?.recommendations)
      ? recommendationsRes.data.recommendations
      : [];
  } catch (e) {
    learningInsightsError.value = e.response?.data?.error?.message || e.message || 'Could not load learning insights';
    learningInsightsDomains.value = [];
    learningInsightsGoals.value = [];
    learningInsightsRecommendations.value = [];
  } finally {
    learningInsightsLoading.value = false;
  }
}

async function loadLearningCatalog() {
  learningCatalogLoading.value = true;
  learningCatalogError.value = '';
  try {
    const res = await api.get('/learning-standards/catalog', { skipGlobalLoading: true });
    const catalog = Array.isArray(res.data?.catalog) ? res.data.catalog : [];
    learningCatalogDomains.value = catalog.map((d) => ({
      id: Number(d.id),
      code: d.code,
      title: d.title
    }));
    const skills = [];
    for (const domain of catalog) {
      const did = Number(domain.id);
      for (const row of Array.isArray(domain.skills) ? domain.skills : []) {
        skills.push({ id: Number(row.id), title: row.title || row.code || `Skill ${row.id}`, domainId: did });
      }
      for (const sub of Array.isArray(domain.subdomains) ? domain.subdomains : []) {
        for (const row of Array.isArray(sub.skills) ? sub.skills : []) {
          skills.push({ id: Number(row.id), title: row.title || row.code || `Skill ${row.id}`, domainId: did });
        }
      }
    }
    const unique = new Map();
    for (const s of skills) {
      if (!unique.has(s.id)) unique.set(s.id, s);
    }
    learningCatalogSkills.value = [...unique.values()];
    resetLearningGoalForm();
  } catch (e) {
    learningCatalogError.value = e.response?.data?.error?.message || e.message || 'Could not load catalog';
    learningCatalogDomains.value = [];
    learningCatalogSkills.value = [];
  } finally {
    learningCatalogLoading.value = false;
  }
}

function openNewLearningGoalForm() {
  if (!learningCatalogDomains.value.length && !learningCatalogLoading.value) {
    loadLearningCatalog();
  }
  resetLearningGoalForm();
  learningGoalFormOpen.value = true;
}

function beginEditLearningGoal(goal) {
  if (!goal) return;
  if (!learningCatalogDomains.value.length && !learningCatalogLoading.value) {
    loadLearningCatalog();
  }
  learningGoalForm.goalId = Number(goal.id);
  learningGoalForm.domainId = Number(goal.domain_id || 0);
  learningGoalForm.skillId = Number(goal.skill_id || 0);
  learningGoalForm.measurementType = String(goal.measurement_type || 'numeric') === 'rubric' ? 'rubric' : 'numeric';
  learningGoalForm.baselineValue = goal.baseline_value != null ? Number(goal.baseline_value) : null;
  learningGoalForm.targetValue = goal.target_value != null ? Number(goal.target_value) : null;
  learningGoalForm.baselineRubricLevel = String(goal.baseline_rubric_level || '');
  learningGoalForm.targetRubricLevel = String(goal.target_rubric_level || '');
  learningGoalForm.startDate = String(goal.start_date || '').slice(0, 10) || todayYmd();
  learningGoalForm.targetDate = String(goal.target_date || '').slice(0, 10) || todayYmd();
  learningGoalForm.notes = String(goal.notes || '');
  learningGoalFormError.value = '';
  learningGoalFormOpen.value = true;
}

function cancelLearningGoalForm() {
  learningGoalFormOpen.value = false;
  learningGoalFormError.value = '';
}

async function saveLearningGoal() {
  const clientId = Number(learningInsightsClientId.value || 0);
  if (!clientId) return;
  if (!learningGoalForm.domainId || !learningGoalForm.skillId) {
    learningGoalFormError.value = 'Domain and skill are required.';
    return;
  }
  if (!learningGoalForm.startDate || !learningGoalForm.targetDate) {
    learningGoalFormError.value = 'Start date and target date are required.';
    return;
  }
  learningGoalSaving.value = true;
  learningGoalFormError.value = '';
  try {
    const payload = {
      clientId,
      domainId: Number(learningGoalForm.domainId),
      skillId: Number(learningGoalForm.skillId),
      measurementType: learningGoalForm.measurementType,
      startDate: learningGoalForm.startDate,
      targetDate: learningGoalForm.targetDate,
      notes: learningGoalForm.notes || null,
      ...(learningGoalForm.measurementType === 'numeric'
        ? {
            baselineValue: learningGoalForm.baselineValue != null ? Number(learningGoalForm.baselineValue) : null,
            targetValue: learningGoalForm.targetValue != null ? Number(learningGoalForm.targetValue) : null
          }
        : {
            baselineRubricLevel: learningGoalForm.baselineRubricLevel || null,
            targetRubricLevel: learningGoalForm.targetRubricLevel || null
          })
    };
    if (learningGoalForm.goalId) {
      await api.patch(`/learning-goals/${learningGoalForm.goalId}`, payload);
    } else {
      await api.post('/learning-goals', payload);
    }
    learningGoalFormOpen.value = false;
    await loadLearningInsights();
  } catch (e) {
    learningGoalFormError.value = e.response?.data?.error?.message || e.message || 'Failed to save goal';
  } finally {
    learningGoalSaving.value = false;
  }
}

async function activateLearningGoal(goal) {
  const goalId = Number(goal?.id || 0);
  if (!goalId) return;
  try {
    await api.post(`/learning-goals/${goalId}/activate`, {}, { skipGlobalLoading: true });
    await loadLearningInsights();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Failed to activate goal');
  }
}

async function archiveLearningGoal(goal) {
  const goalId = Number(goal?.id || 0);
  if (!goalId) return;
  try {
    await api.post(`/learning-goals/${goalId}/archive`, {}, { skipGlobalLoading: true });
    await loadLearningInsights();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || e.message || 'Failed to archive goal');
  }
}

async function clockIn() {
  if (!eventBillingAgencyId.value || !eventId.value) return;
  clockBusy.value = true;
  clockMessage.value = '';
  try {
    const body = { agencyId: eventBillingAgencyId.value };
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
  if (!eventBillingAgencyId.value || !eventId.value) return;
  clockBusy.value = true;
  clockMessage.value = '';
  try {
    const res = await api.post(
      `/skill-builders/events/${eventId.value}/kiosk/clock-out`,
      { agencyId: eventBillingAgencyId.value },
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
  if (!eventBillingAgencyId.value || !eventId.value) return;
  chatLoading.value = true;
  chatError.value = '';
  try {
    const r = await api.get(`/skill-builders/events/${eventId.value}/chat-thread`, {
      params: { agencyId: eventBillingAgencyId.value },
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
  () => [eventId.value, route.params.organizationSlug],
  () => {
    kioskSessionId.value = 0;
    kioskClientId.value = 0;
    clientAttSessionId.value = 0;
    clientAttSelectedClientIds.value = [];
    clientAttDidInitSelection.value = false;
    clientAttTimeIn.value = '';
    clientAttTimeOut.value = '';
    clientAttSig.value = '';
    learningInsightsClientId.value = 0;
    learningInsightsDomains.value = [];
    learningInsightsGoals.value = [];
    learningInsightsRecommendations.value = [];
    learningInsightsError.value = '';
    loadDetail();
    ensureChatAndLoad();
  },
  { immediate: true }
);

watch(
  () => [detail.value?.programPortal?.slug, route.params.organizationSlug, eventId.value],
  () => {
    const ps = String(detail.value?.programPortal?.slug || '').trim().toLowerCase();
    const cur = String(route.params.organizationSlug || '').trim().toLowerCase();
    if (!ps || !eventId.value || ps === cur) return;
    router.replace({
      name: 'SkillBuildersEventPortal',
      params: { organizationSlug: ps, eventId: String(eventId.value) },
      query: route.query
    });
  },
  { flush: 'post' }
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
  () => staffingActiveSessionDateId.value,
  async () => {
    if (!staffingEnabled.value) return;
    await Promise.all([
      loadStaffingSessionGroups(),
      loadStaffingSessionAssignments(),
      loadStaffingSessionRequests()
    ]);
  }
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
    if (!learningInsightsClientId.value && validIds.length) {
      learningInsightsClientId.value = validIds[0];
    }
  },
  { immediate: true }
);

watch(
  () => learningInsightsClientId.value,
  () => {
    if (railActive.value === 'learning') {
      loadLearningInsights();
    }
  }
);

watch(
  () => learningGoalForm.domainId,
  () => {
    const currentSkill = Number(learningGoalForm.skillId || 0);
    const exists = filteredLearningSkills.value.some((s) => Number(s.id) === currentSkill);
    if (!exists) {
      learningGoalForm.skillId = Number(filteredLearningSkills.value?.[0]?.id || 0);
    }
  }
);

watch(
  () => railActive.value,
  (section) => {
    if (section === 'learning' && learningInsightsClientId.value) {
      loadLearningInsights();
      if (!learningCatalogDomains.value.length && !learningCatalogLoading.value) {
        loadLearningCatalog();
      }
    }
  }
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
  max-width: 1080px;
  margin: 0 auto;
  padding: 4px 0 40px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.sbep-hub-hero {
  border-radius: 28px;
  padding: 26px 26px 24px;
  background:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.98), transparent 45%),
    linear-gradient(135deg, #fff4e8 0%, #ffe1dc 40%, #eef6ff 100%);
  border: 1px solid rgba(244, 114, 65, 0.16);
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.08);
}
.sbep-hub-eyebrow {
  margin: 0 0 8px;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #c2410c;
}
.sbep-hub-hero-title {
  margin: 0 0 10px;
  font-size: clamp(1.45rem, 2.6vw, 2rem);
  font-weight: 800;
  color: #1f2a44;
  line-height: 1.15;
  letter-spacing: -0.02em;
}
.sbep-hub-hero-sub {
  margin: 0;
  max-width: 52rem;
  font-size: 0.95rem;
  line-height: 1.55;
  color: #52607a;
}
.sbep-hub-hero-actions {
  margin-top: 12px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.sbep-hub-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
  margin-top: 20px;
}
.sbep-hub-stat {
  padding: 14px 14px 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(148, 163, 184, 0.22);
}
.sbep-hub-stat-val {
  display: block;
  font-size: 1.45rem;
  font-weight: 800;
  color: #1f2a44;
  line-height: 1.1;
}
.sbep-hub-stat-lbl {
  display: block;
  margin-top: 4px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
}

.sbep-event-tabs {
  width: 100%;
}
.sbep-event-tabs-scroll {
  display: flex;
  flex-wrap: nowrap;
  gap: 10px;
  overflow-x: auto;
  padding: 4px 2px 8px;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
}
.sbep-event-tab {
  flex: 0 0 auto;
  scroll-snap-align: start;
  min-width: 118px;
  max-width: 220px;
  padding: 11px 14px 10px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(255, 255, 255, 0.96);
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease,
    transform 0.12s ease;
}
.sbep-event-tab:hover {
  border-color: rgba(249, 115, 22, 0.4);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
  transform: translateY(-1px);
}
.sbep-event-tab.active {
  border-color: rgba(234, 88, 12, 0.55);
  background: #fff;
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.08);
  transform: none;
}
.sbep-event-tab-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 800;
  color: #c2410c;
  line-height: 1.2;
}
.sbep-event-tab-meta {
  display: block;
  margin-top: 5px;
  font-size: 0.65rem;
  line-height: 1.35;
  font-weight: 600;
  color: #64748b;
}
.sbep-event-tabs--hub .sbep-event-tabs-scroll {
  padding-bottom: 4px;
}
.sbep-event-tabs--dash {
  position: sticky;
  top: 0;
  z-index: 6;
  max-width: 1080px;
  margin: 0 auto 12px;
  padding: 10px 0 12px;
  background: linear-gradient(180deg, rgba(255, 252, 248, 0.97) 0%, rgba(255, 252, 248, 0.92) 70%, transparent 100%);
  border-bottom: 1px solid rgba(244, 114, 65, 0.12);
  backdrop-filter: blur(10px);
}

.sbep-hub-section-label {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #94a3b8;
}
.sbep-hub-panels {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}
.sbep-hub-panel {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  text-align: left;
  padding: 18px 18px 16px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.05);
  cursor: pointer;
  font: inherit;
  color: #0f172a;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.14s ease;
}
.sbep-hub-panel:hover {
  border-color: rgba(249, 115, 22, 0.35);
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.1);
  transform: translateY(-2px);
}
.sbep-hub-panel:focus-visible {
  outline: 2px solid #ea580c;
  outline-offset: 2px;
}
.sbep-hub-panel-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}
.sbep-hub-panel-title {
  font-weight: 800;
  font-size: 1.02rem;
  line-height: 1.25;
  color: #c2410c;
}
.sbep-hub-panel-arrow {
  flex-shrink: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: #fb923c;
  margin-top: 2px;
}
.sbep-hub-panel-teaser {
  font-size: 0.86rem;
  line-height: 1.45;
  color: #64748b;
}
.sbep-hub-panel-cta {
  margin-top: 4px;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #94a3b8;
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

.sbep-learning-controls {
  display: flex;
  align-items: end;
  gap: 10px;
  flex-wrap: wrap;
  margin: 8px 0 12px;
}

.sbep-learning-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 10px;
}

.sbep-learning-card {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 10px;
  background: var(--bg-alt, #f8fafc);
}

.sbep-learning-goal-form {
  margin-top: 8px;
}

.sbep-learning-goal-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px 10px;
  margin-bottom: 8px;
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
  flex: 0 0 108px;
  position: sticky;
  top: 8px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 10px 8px;
  border-radius: 18px;
  background: rgba(255, 247, 237, 0.65);
  border: 1px solid rgba(244, 114, 65, 0.14);
}
.sbep-rail-item {
  border: none;
  background: transparent;
  padding: 8px 6px;
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
  color: #64748b;
  transition:
    color 0.15s ease,
    background 0.15s ease,
    transform 0.12s ease;
}
.sbep-rail-item:hover {
  color: #c2410c;
  background: rgba(255, 255, 255, 0.55);
  transform: translateY(-1px);
}
.sbep-rail-item.active {
  color: #9a3412;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
  transform: none;
}
.sbep-rail-mark {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(251, 146, 60, 0.15);
  border: 1px solid rgba(251, 146, 60, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 800;
  color: #c2410c;
  letter-spacing: 0.02em;
}
.sbep-rail-item.active .sbep-rail-mark {
  background: rgba(251, 146, 60, 0.28);
  border-color: rgba(234, 88, 12, 0.35);
}
.sbep-rail-lbl {
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
  max-width: 96px;
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
  .sbep-hub-panels {
    grid-template-columns: 1fr;
  }
  .sbep-hub-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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
.sbep-section-intro {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 4px;
  max-width: 52rem;
}
.sbep-section-intro p {
  margin: 0;
}
.sbep-text-link {
  font-weight: 700;
  color: #c2410c;
  text-decoration: none;
}
.sbep-text-link:hover,
.sbep-text-link:focus-visible {
  text-decoration: underline;
  color: #9a3412;
}
.sbep-text-link-meta {
  color: #64748b;
  font-weight: 500;
}
.sbep-guardian-portal-line {
  padding-top: 4px;
}
.sbep-action-toolbar {
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.22);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.04);
}
.sbep-action-toolbar--tight {
  margin-top: 12px;
}
.sbep-reg-intake-box {
  margin-top: 16px;
  padding: 16px 18px;
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 251, 247, 0.9) 100%);
  border: 1px solid rgba(244, 114, 65, 0.14);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.05);
}
.sbep-reg-intake-title {
  margin: 0 0 12px;
  line-height: 1.5;
}
.sbep-reg-intake-name {
  font-weight: 600;
  color: #334155;
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
.sbep-sessions-edit-row td {
  background: #f8fafc;
}
.sbep-inline-edit-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  align-items: center;
}
@media (max-width: 980px) {
  .sbep-inline-edit-grid {
    grid-template-columns: 1fr;
  }
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
.sbep-reg-enrolled-summary {
  margin-top: 18px;
  padding: 14px 16px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(248, 250, 252, 0.98) 0%, rgba(255, 251, 245, 0.92) 100%);
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.75);
}
.sbep-reg-enrolled-summary p {
  margin: 0;
  line-height: 1.55;
}
.sbep-reg-jump-btn {
  padding: 0;
  font-size: inherit;
  vertical-align: baseline;
  margin-left: 4px;
}
.sbep-add-client-block {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border, #e2e8f0);
}
.sbep-add-client-block--prominent {
  margin-top: 0;
  padding: 14px 16px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  background: var(--surface-secondary, #f8fafc);
}
.sbep-add-client-lead {
  margin: 0 0 10px;
}
.sbep-add-client-option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 0 10px;
  font-size: 0.88rem;
  cursor: pointer;
}
.sbep-add-client-option input {
  margin-top: 2px;
}
.sbep-add-client-result-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  min-width: 0;
}
.sbep-add-client-badge {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  background: #e0f2fe;
  color: #0369a1;
}
.sbep-add-client-badge--ready {
  background: #dcfce7;
  color: #166534;
}
.sbep-add-client-badge--muted {
  background: #f1f5f9;
  color: #64748b;
  text-transform: none;
  font-weight: 500;
}
.sbep-add-client-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.sbep-add-client-input {
  flex: 1 1 200px;
  min-width: 0;
}
.sbep-add-client-results {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sbep-add-client-result-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 10px;
  background: var(--surface-secondary, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  font-size: 0.9rem;
}
.sbep-add-client-label {
  font-weight: 600;
  color: var(--text-primary, #1e293b);
}
.sbep-add-client-err {
  margin-top: 8px;
  font-size: 0.88rem;
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
.sbep-roster-actions {
  text-align: right;
  white-space: nowrap;
}
.sbep-row-action-stack {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}
.sbep-row-save-btn {
  min-width: 64px;
}
.sbep-row-save-status {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  line-height: 1.4;
  letter-spacing: 0.02em;
}
.sbep-row-save-status.is-saving {
  background: rgba(245, 158, 11, 0.15);
  color: #b45309;
}
.sbep-row-save-status.is-saved {
  background: rgba(16, 185, 129, 0.18);
  color: #047857;
}
.sbep-row-save-status.is-error {
  background: rgba(239, 68, 68, 0.18);
  color: #b91c1c;
}
.sbep-row-remove-btn {
  font-size: 12px;
}

/* Constrain Participant name column on the participants tables so other columns fit */
.sbep-roster-table--participants th:first-child,
.sbep-roster-table--participants td:first-child {
  max-width: 200px;
  min-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sbep-roster-table--participants .sbep-roster-client-link {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

/* Applicants card + workflow-status filter pills (registrants vs participants) */
.sbep-participant-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: stretch;
  margin: 12px 0 8px;
}
.sbep-applicants-card {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 12px 18px;
  border-radius: 14px;
  border: 1px solid rgba(220, 38, 38, 0.35);
  background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
  color: #991b1b;
  cursor: pointer;
  text-align: left;
  font: inherit;
  transition: transform 120ms ease, box-shadow 120ms ease;
  min-width: 180px;
}
.sbep-applicants-card:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(220, 38, 38, 0.18);
}
.sbep-applicants-card:disabled {
  cursor: default;
  opacity: 0.85;
}
.sbep-applicants-card.is-active {
  border-color: rgba(220, 38, 38, 0.65);
  box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.18);
}
.sbep-applicants-count {
  font-size: 28px;
  font-weight: 800;
  line-height: 1;
}
.sbep-applicants-label {
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.01em;
}
.sbep-applicants-help {
  font-size: 11px;
  font-weight: 600;
  color: #b91c1c;
  opacity: 0.85;
}
.sbep-applicants-card.is-pulsing {
  animation: sbep-applicants-pulse 1.6s ease-in-out infinite;
}
@keyframes sbep-applicants-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.45); }
  50% { box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); }
}

.sbep-status-filter {
  display: inline-flex;
  align-items: stretch;
  background: var(--surface-2, #f1f5f9);
  border-radius: 999px;
  padding: 4px;
  gap: 2px;
}
.sbep-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 999px;
  border: 0;
  background: transparent;
  cursor: pointer;
  font-weight: 700;
  font-size: 13px;
  color: var(--text-secondary, #475569);
  transition: background 120ms ease, color 120ms ease;
}
.sbep-status-pill:hover {
  color: var(--text, #0f172a);
}
.sbep-status-pill.is-active {
  background: var(--surface, #ffffff);
  color: var(--text, #0f172a);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}
.sbep-status-pill-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  font-size: 11px;
  font-weight: 800;
  color: var(--text-secondary, #475569);
}
.sbep-status-pill.is-active .sbep-status-pill-count {
  background: rgba(15, 118, 110, 0.18);
  color: #115e59;
}
.sbep-status-pill-count.is-pulsing {
  background: rgba(220, 38, 38, 0.18);
  color: #991b1b;
  animation: sbep-pill-pulse 1.6s ease-in-out infinite;
}
@keyframes sbep-pill-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(220, 38, 38, 0); }
}

/* Read-only "Denied" chip — visually distinct from the clickable pills so
   coordinators understand it's just a tally, not a filter. */
.sbep-status-pill--denied {
  background: rgba(148, 163, 184, 0.18);
  color: var(--text-secondary, #475569);
  cursor: default;
  border: 1px dashed rgba(148, 163, 184, 0.5);
}
.sbep-status-pill--denied:hover {
  background: rgba(148, 163, 184, 0.18);
}
.sbep-status-pill--denied .sbep-status-pill-count {
  background: rgba(100, 116, 139, 0.18);
  color: var(--text-secondary, #475569);
}

/* Per-group breakdown row shown above the participants list when more than
   one staffing group has people in it. */
.sbep-group-breakdown {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 6px 0 14px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(20, 184, 166, 0.08);
  border: 1px solid rgba(20, 184, 166, 0.18);
}
.sbep-group-breakdown-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #475569);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.sbep-group-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(20, 184, 166, 0.25);
  font-size: 13px;
  color: var(--text-primary, #0f172a);
}
.sbep-group-chip strong {
  font-weight: 600;
}
.sbep-group-chip-session {
  color: var(--text-secondary, #64748b);
  font-size: 12px;
}
.sbep-group-chip-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 11px;
  background: rgba(20, 184, 166, 0.20);
  color: #0f766e;
  font-weight: 700;
  font-size: 12px;
}

.sbep-status-hint {
  margin: 4px 0 12px;
}

/* ===== Expanded registrants table ===== */
.sbep-registrants-wrap {
  border: 1px solid rgba(220, 38, 38, 0.18);
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(254, 242, 242, 0.35);
}
.sbep-roster-table--registrants .sbep-registrants-date {
  white-space: nowrap;
  color: var(--text-secondary, #475569);
  font-variant-numeric: tabular-nums;
}
/* Denied registrants: visually muted across the whole row so coordinators can
   tell at a glance that the row is excluded from every count. The strikethrough
   on the name makes the "denied" status unambiguous. */
.sbep-row-denied,
.sbep-row-denied td {
  background: rgba(148, 163, 184, 0.12) !important;
  color: var(--text-secondary, #64748b) !important;
}
.sbep-row-denied td {
  filter: grayscale(0.6);
  opacity: 0.78;
}
.sbep-row-denied .sbep-roster-client-link,
.sbep-row-denied .sbep-roster-client-name {
  text-decoration: line-through;
  text-decoration-thickness: 1px;
  color: var(--text-secondary, #64748b);
}

/* Accept / Deny buttons (intake outcome picker on the registrants row) */
.sbep-registrants-intake-cell {
  min-width: 160px;
}
.sbep-registrants-intake-actions {
  display: inline-flex;
  gap: 4px;
}
.sbep-outcome-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
  transition: transform 80ms ease, box-shadow 120ms ease, background 120ms ease;
}
.sbep-outcome-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}
.sbep-outcome-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.sbep-outcome-btn--accept {
  background: rgba(16, 185, 129, 0.14);
  color: #047857;
  border-color: rgba(16, 185, 129, 0.4);
}
.sbep-outcome-btn--accept:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.22);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
}
.sbep-outcome-btn--deny {
  background: rgba(239, 68, 68, 0.12);
  color: #b91c1c;
  border-color: rgba(239, 68, 68, 0.35);
}
.sbep-outcome-btn--deny:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.18);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.22);
}
.sbep-outcome-needed {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  color: var(--text-secondary, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 700;
}
.sbep-outcome-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.02em;
}
.sbep-outcome-pill.is-accepted {
  background: rgba(16, 185, 129, 0.18);
  color: #047857;
}
.sbep-outcome-pill.is-denied {
  background: rgba(148, 163, 184, 0.22);
  color: #475569;
}
.sbep-outcome-reset {
  display: inline-block;
  margin-left: 6px;
  font-size: 11px;
  vertical-align: middle;
}
.sbep-tp-hint {
  margin: 4px 0 0;
  font-size: 10px;
  line-height: 1.3;
  color: var(--text-secondary, #94a3b8);
  max-width: 140px;
}
.sbep-row-tp-pending {
  background: #fffbeb;
}
.sbep-row-tp-pending td {
  border-color: #fde68a;
}
.sbep-row-tp-pending.sbep-row-mine {
  background: #fef3c7;
}
.sbep-tp-due-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: #92400e;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  vertical-align: middle;
  white-space: nowrap;
}

/* ===== Compact participants table (graduated workflow) ===== */
.sbep-participants-wrap {
  border: 1px solid rgba(15, 118, 110, 0.18);
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(204, 251, 241, 0.18);
}
.sbep-participants-footnote {
  margin: 8px 4px 0;
  font-style: italic;
  opacity: 0.85;
}
.sbep-flag-th {
  white-space: nowrap;
}
.sbep-flag-cell {
  white-space: nowrap;
}
.sbep-flag-empty {
  color: var(--text-secondary, #cbd5e1);
  font-weight: 700;
}
.sbep-safety-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: transform 80ms ease, box-shadow 120ms ease, background 120ms ease;
}
.sbep-safety-chip:disabled {
  cursor: not-allowed;
}
.sbep-safety-chip.is-readonly {
  cursor: help;
  opacity: 0.95;
}
.sbep-safety-chip--eloping {
  background: rgba(220, 38, 38, 0.14);
  color: #b91c1c;
  border-color: rgba(220, 38, 38, 0.35);
}
.sbep-safety-chip--eloping:hover:not(:disabled) {
  background: rgba(220, 38, 38, 0.22);
}
.sbep-safety-chip--support {
  background: rgba(245, 158, 11, 0.16);
  color: #b45309;
  border-color: rgba(245, 158, 11, 0.4);
}
.sbep-safety-chip--support:hover:not(:disabled) {
  background: rgba(245, 158, 11, 0.24);
}

/* Family-attendance pill triplet (Yes / No / Pending) — distinct from the
   single-button .sbep-confirm-pill used elsewhere on the staffing tables. */
.sbep-confirm-cell {
  min-width: 200px;
}
.sbep-attend-pills {
  display: inline-flex;
  background: var(--surface-2, #f1f5f9);
  border-radius: 999px;
  padding: 3px;
  gap: 2px;
}
.sbep-attend-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 999px;
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary, #64748b);
  transition: background 120ms ease, color 120ms ease, box-shadow 120ms ease;
}
.sbep-attend-pill:hover:not(:disabled):not(.is-active) {
  color: var(--text, #0f172a);
}
.sbep-attend-pill:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}
.sbep-attend-pill--yes.is-active {
  background: rgba(16, 185, 129, 0.22);
  color: #047857;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}
.sbep-attend-pill--no.is-active {
  background: rgba(239, 68, 68, 0.20);
  color: #b91c1c;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}
.sbep-attend-pill--pending.is-active {
  background: var(--surface, #ffffff);
  color: var(--text, #0f172a);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}
.sbep-confirm-meta {
  margin: 4px 0 0;
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 700;
}
.sbep-row-mine {
  background: rgba(15, 118, 110, 0.06);
  box-shadow: inset 3px 0 0 0 rgba(15, 118, 110, 0.6);
}
.sbep-mine-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 8px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  border-radius: 999px;
  background: rgba(15, 118, 110, 0.15);
  color: #115e59;
  border: 1px solid rgba(15, 118, 110, 0.45);
  text-transform: uppercase;
}
.sbep-client-att-row--mine {
  background: rgba(15, 118, 110, 0.08);
  border-radius: 6px;
  padding: 4px 6px;
  margin-left: -6px;
}
.sbep-roster-mine-legend {
  margin-top: 6px;
  margin-bottom: 8px;
}
.sbep-roster-assigned-mine {
  font-weight: 800;
  color: #115e59;
}
.sbep-workflow-chip {
  display: inline-flex;
  align-items: center;
  margin-right: 4px;
  padding: 2px 7px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.5);
}
.sbep-workflow-chip--ok {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.45);
  color: #065f46;
}
.sbep-workflow-chip--pending {
  background: rgba(234, 88, 12, 0.10);
  border-color: rgba(234, 88, 12, 0.40);
  color: #9a3412;
}
.sbep-workflow-btn {
  border: 1px solid rgba(148, 163, 184, 0.55);
  background: #fff;
  border-radius: 999px;
  padding: 5px 10px;
  font-weight: 700;
  font-size: 12px;
  color: #334155;
  cursor: pointer;
  white-space: nowrap;
}
.sbep-workflow-btn.is-complete {
  border-color: rgba(15, 118, 110, 0.5);
  background: rgba(16, 185, 129, 0.12);
  color: #0f766e;
}
.sbep-workflow-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.sbep-confirm-pill {
  border: 1px solid rgba(148, 163, 184, 0.55);
  background: rgba(148, 163, 184, 0.08);
  border-radius: 999px;
  padding: 5px 10px;
  font-weight: 700;
  font-size: 12px;
  color: #475569;
  white-space: nowrap;
}
.sbep-provider-select {
  width: 100%;
  min-width: 180px;
}
.sbep-staffing-wrap {
  margin-top: 10px;
}
.sbep-staffing-top {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 8px;
}
.sbep-staffing-session {
  min-width: min(520px, 100%);
}
.sbep-staffing-meta {
  flex: 1;
  min-width: 260px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}
.sbep-staffing-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sbep-staffing-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 16px;
  align-items: start;
}
.sbep-group-block + .sbep-group-block {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid rgba(148, 163, 184, 0.25);
}
.sbep-staffing-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sbep-staffing-card {
  padding: 12px 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  background: #f8fafc;
}
.sbep-req-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 10px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 12px;
  background: #fff;
  margin-top: 8px;
}
.sbep-req-name {
  font-weight: 700;
  color: #0f172a;
}
.sbep-req-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
@media (max-width: 920px) {
  .sbep-staffing-layout {
    grid-template-columns: 1fr;
  }
}
.sbep-roster-att {
  line-height: 1.45;
}
.sbep-roster-missing {
  opacity: 0.45;
}
.sbep-subh {
  margin: 0 0 8px;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #94a3b8;
}
.sbep-rail-content .sbep-sched-block {
  border-top-color: rgba(148, 163, 184, 0.25);
}
.sbep-rail-content .sbep-sessions-table th {
  color: #64748b;
  border-bottom-color: rgba(148, 163, 184, 0.35);
}
.sbep-rail-content .sbep-sessions-table td {
  border-bottom-color: rgba(241, 245, 249, 0.95);
}
.sbep-rail-content .sbep-join-li {
  border-bottom-color: rgba(148, 163, 184, 0.18);
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
.sbep-schedule-defaults {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
  margin: 10px 0 14px;
}
.sbep-default-chip {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 14px;
  background: #fff;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.sbep-default-chip.good {
  border-color: rgba(15, 118, 110, 0.28);
  background: rgba(240, 253, 250, 0.72);
}
.sbep-default-kicker {
  color: #64748b;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.sbep-default-chip strong {
  color: var(--text-primary, #0f172a);
  line-height: 1.2;
}
.sbep-default-chip small {
  color: #64748b;
  font-size: 0.74rem;
}
.sbep-apply-defaults-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: -4px 0 14px;
  flex-wrap: wrap;
}
.sbep-apply-defaults-row small {
  color: #64748b;
}
.sbep-schedule-day-card {
  margin-top: 16px;
  border: 1px solid rgba(15, 118, 110, 0.18);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(240, 253, 250, 0.72), #fff);
  padding: 14px;
}
.sbep-schedule-day-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
}
.sbep-schedule-day-select {
  max-width: 220px;
}
.sbep-day-stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}
.sbep-day-stat {
  border: 1px solid rgba(15, 118, 110, 0.16);
  border-radius: 12px;
  background: #fff;
  padding: 8px 10px;
}
.sbep-day-stat span {
  display: block;
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 700;
}
.sbep-day-stat strong {
  color: var(--primary, #0f766e);
  font-size: 1.1rem;
}
.sbep-day-provider-list {
  margin: 8px 0 12px;
  color: var(--text-primary, #0f172a);
  font-size: 0.86rem;
}
.sbep-day-groups-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}
.sbep-day-group-card {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 14px;
  background: #fff;
  padding: 10px;
}
.sbep-day-group-title {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.sbep-day-group-title span {
  min-width: 28px;
  border-radius: 999px;
  background: rgba(15, 118, 110, 0.1);
  color: var(--primary, #0f766e);
  font-weight: 800;
  text-align: center;
  padding: 2px 8px;
}
.sbep-day-participant-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.sbep-day-participant-list li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px dashed var(--border, #e2e8f0);
  font-size: 0.83rem;
}
.sbep-day-participant-list li:first-child {
  border-top: none;
}
.sbep-day-participant-list em {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 2px 7px;
  font-style: normal;
  font-weight: 700;
  font-size: 0.72rem;
}
.sbep-day-participant-list em.is-yes {
  background: #dcfce7;
  color: #166534;
}
.sbep-day-participant-list em.is-no {
  background: #fee2e2;
  color: #991b1b;
}
.sbep-day-participant-list em.is-pending {
  background: #e2e8f0;
  color: #475569;
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
.sbep-att-subhead {
  margin: 22px 0 6px;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
}
.sbep-att-subhead:first-of-type {
  margin-top: 0;
}
.sbep-att-filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.sbep-att-filter-row .sbep-label {
  margin: 0;
}
.sbep-plan-block {
  margin-bottom: 22px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.sbep-plan-table th,
.sbep-plan-table td {
  vertical-align: middle;
}
.sbep-plan-select { min-width: 200px; }
.sbep-plan-time { max-width: 130px; }
.sbep-att-person {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 160px;
}
.sbep-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.45);
}
.sbep-modal-card {
  width: min(560px, 100%);
  max-height: min(90vh, 820px);
  overflow: auto;
  border-radius: 16px;
  border: 1px solid var(--border, #e2e8f0);
  background: #fff;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.18);
}
.sbep-modal-hdr {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.sbep-modal-title {
  margin: 0;
  font-size: 1.05rem;
}
.sbep-release-detail {
  padding-bottom: 18px;
}
.sbep-release-dl {
  display: grid;
  grid-template-columns: minmax(110px, 38%) 1fr;
  gap: 8px 12px;
  margin: 0;
  padding: 16px 18px 0;
}
.sbep-release-dl dt {
  margin: 0;
  font-weight: 700;
  color: #64748b;
  font-size: 0.82rem;
}
.sbep-release-dl dd {
  margin: 0;
}
.sbep-release-photo-wrap {
  padding: 14px 18px 0;
}
.sbep-release-photo {
  display: block;
  width: 100%;
  max-height: 360px;
  object-fit: contain;
  border-radius: 12px;
  border: 1px solid var(--border, #e2e8f0);
  background: #f8fafc;
}
</style>
