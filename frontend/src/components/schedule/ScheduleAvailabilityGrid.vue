<template>
  <div
    class="sched-wrap"
    :class="{
      'sched-wrap-quarter': showQuarterDetail,
      'sched-wrap--dark': darkScheduleTheme
    }"
    :style="scheduleWrapVars"
    data-tour="my-schedule-grid"
  >
    <div class="sched-toolbar" data-tour="my-schedule-toolbar">
      <div class="sched-chrome-top" data-tour="my-schedule-week-nav">
        <div class="sched-chrome-title-block">
          <template v-if="!compactPageChrome">
            <h2 class="sched-page-title">Schedule</h2>
            <p class="sched-page-sub">View and manage availability.</p>
          </template>
          <p class="sched-week-range">Week of {{ weekStart }} · Today {{ todayMmdd }}</p>
        </div>
        <div class="sched-chrome-nav" role="group" aria-label="Week navigation">
          <button
            class="sched-nav-btn"
            type="button"
            title="Jump the grid to the week that contains today"
            @click="goToTodayWeek"
            :disabled="loading"
            data-tour="my-schedule-today-btn"
          >
            Today
          </button>
          <div class="sched-nav-arrows">
            <button class="sched-nav-icon-btn" type="button" aria-label="Previous week" title="Previous week" @click="prevWeek" :disabled="loading">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="sched-nav-icon-btn" type="button" aria-label="Next week" title="Next week" @click="nextWeek" :disabled="loading">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
          <button class="sched-nav-icon-btn" type="button" aria-label="Refresh schedule" title="Reload this week’s schedule from the server" @click="load" :disabled="loading">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18" stroke-linecap="round"/>
            </svg>
          </button>
          <button
            v-if="Number(effectiveAgencyId || 0) > 0"
            class="sched-nav-btn"
            type="button"
            title="Book a session with a client using unified tenant booking"
            :disabled="loading || !effectiveAgencyId"
            @click="openUnifiedBookingPanel()"
          >
            Book session
          </button>
          <div class="sched-span-switch" role="group" aria-label="Day or week schedule">
            <button
              type="button"
              class="sched-span-btn"
              :class="{ on: scheduleSpanMode === 'day' }"
              title="Focus one day (best on phone)"
              @click="setScheduleSpanMode('day')"
            >Day</button>
            <button
              type="button"
              class="sched-span-btn"
              :class="{ on: scheduleSpanMode === 'week' }"
              title="Show the full week grid"
              @click="setScheduleSpanMode('week')"
            >Week</button>
          </div>
        </div>
      </div>

      <div class="sched-toolbar-main">
        <div class="sched-toolbar-left" :class="{ 'sched-office-pulse': showOfficeReminderPulse && !hideOfficeAndCalendarIntegration }">
          <div v-if="!hideOfficeAndCalendarIntegration" class="sched-office-toolbar-group">
            <button
              type="button"
              class="sched-office-cta"
              :class="{ 'sched-office-cta--active': viewMode === 'office_layout' }"
              :disabled="loading || officeGridLoading"
              data-tour="my-schedule-request-office-cta"
              title="Switch to the office/room board to request or book rooms for approval"
              @click="viewMode === 'office_layout' ? viewMode = 'open_finder' : viewMode = 'office_layout'"
            >
              <span class="sched-office-cta-icon" aria-hidden="true">
                <svg v-if="viewMode === 'office_layout'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
                </svg>
                <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 21h18" />
                  <path d="M5 21V7l8-4v18" />
                  <path d="M19 21V11l-6-4" />
                  <path d="M9 9v.01" /><path d="M9 13v.01" /><path d="M9 17v.01" />
                </svg>
              </span>
              <span class="sched-office-cta-copy">
                <span class="sched-office-cta-title">{{ viewMode === 'office_layout' ? 'Personal calendar' : 'Request office or room' }}</span>
                <span class="sched-office-cta-sub">{{ viewMode === 'office_layout' ? 'Back to your week grid' : 'Send a time for staff approval' }}</span>
              </span>
            </button>
            <div class="sched-view-switch" role="tablist" aria-label="Schedule view" data-tour="my-schedule-view-switch">
              <button
                v-for="opt in viewModeOptions"
                :key="`view-${opt.id}`"
                type="button"
                class="sched-seg"
                role="tab"
                :aria-selected="String(viewMode === opt.id)"
                :class="{
                  on: viewMode === opt.id,
                  'sched-seg--back': opt.id === 'open_finder' && viewMode === 'office_layout'
                }"
                :disabled="loading"
                :title="opt.id === 'open_finder'
                  ? 'Personal week grid — book sessions, meetings, and holds on your calendar'
                  : 'Office & room board — request or assign rooms in a building'"
                @click="viewMode = opt.id"
              >
                <span v-if="opt.id === 'open_finder' && viewMode === 'office_layout'">← </span>{{ opt.label }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="officeReminderToast && !hideOfficeAndCalendarIntegration" class="sched-office-reminder-toast">
          {{ officeReminderToast }}
        </div>
      </div>

      <div class="sched-tool-bar" data-tour="my-schedule-tool-groups">
        <div v-if="!hideOfficeAndCalendarIntegration" class="sched-tool-cluster" title="Ways to see other people’s calendars">
          <span class="sched-tool-cluster__label">People</span>
          <button
            type="button"
            class="sched-pill sched-pill--emphasis"
            :class="{ on: showPeerBusyOverlay }"
            role="switch"
            :aria-checked="String(!!showPeerBusyOverlay)"
            :disabled="loading"
            @click="togglePeerBusyOverlay"
            title="Overlay selected coworkers’ busy times on your grid. Shows Busy / initials only (no client names) unless you turn on Show details."
            data-tour="my-schedule-peers-busy-toggle"
          >
            Peers (busy)
          </button>
          <router-link
            class="sched-pill sched-pill-link"
            :to="staffSchedulesCompareTo"
            title="Open Staff schedules to compare several people at once. Providers see busy-only; admins can use detailed stacked view."
            data-tour="my-schedule-staff-compare-link"
          >
            Staff schedules
          </router-link>
        </div>

        <div v-if="!hideOfficeAndCalendarIntegration" class="sched-tool-cluster" title="Office bookings for this person — All buildings, one building, or Off">
          <span class="sched-tool-cluster__label">Office</span>
          <select
            v-model.number="selectedOfficeLocationId"
            class="sched-select sched-select--compact"
            :disabled="loading || officeGridLoading"
            data-tour="my-schedule-office-select"
            title="All = every office booking for this person. Pick a building for room-count overlay, or Off to hide office blocks."
          >
            <option :value="OFFICE_SCOPE_ALL">All offices</option>
            <option :value="OFFICE_SCOPE_OFF">Off</option>
            <option v-for="o in officeLocations" :key="`sched-office-${o.id}`" :value="Number(o.id)">{{ o.name }}</option>
          </select>
          <button
            v-if="isOfficeScopeSpecific"
            type="button"
            class="sched-pill"
            :class="{ on: showOfficeOverlay }"
            role="switch"
            :aria-checked="String(!!showOfficeOverlay)"
            :disabled="loading"
            @click="showOfficeOverlay = !showOfficeOverlay"
            title="When a specific office is selected, show open/assigned room-count labels on empty cells"
          >
            Room counts
          </button>
          <router-link
            v-if="canManageOffices"
            class="sched-pill sched-pill-link"
            :to="officeRequestsApproveLink"
            data-tour="my-schedule-approve-office-requests"
            title="Open the approval inbox for pending office / room availability requests"
          >
            Approvals
          </router-link>
        </div>

        <div v-if="!hideOfficeAndCalendarIntegration" class="sched-tool-cluster" title="External calendar overlays on your grid">
          <span class="sched-tool-cluster__label">Calendars</span>
          <button
            type="button"
            class="sched-pill"
            :class="{ on: showGoogleBusy }"
            role="switch"
            :aria-checked="String(!!showGoogleBusy)"
            :disabled="loading"
            @click="toggleGoogleBusy"
            title="Show grey busy blocks from your Google Calendar (times only, no titles)."
            data-tour="my-schedule-google-busy-toggle"
          >
            Google busy
          </button>
          <button
            type="button"
            class="sched-pill"
            :class="{ on: showGoogleEvents }"
            role="switch"
            :aria-checked="String(!!showGoogleEvents)"
            :disabled="loading"
            @click="toggleGoogleEvents"
            title="Show Google event titles on the grid (sensitive — may include personal meeting names)."
            data-tour="my-schedule-google-titles-toggle"
          >
            Google titles
          </button>
          <button
            type="button"
            class="sched-pill"
            :class="{ on: showExternalBusy }"
            role="switch"
            :aria-checked="String(!!showExternalBusy)"
            :disabled="loading || !externalCalendarsAvailable.length"
            @click="toggleExternalBusy"
            title="Show busy times imported from Therapy Notes / ICS feeds. Choose which feeds under More tools."
          >
            Therapy Notes
          </button>
          <button
            v-if="!calendarsHidden"
            class="sched-pill"
            type="button"
            :disabled="loading"
            @click="hideAllCalendars"
            title="Temporarily hide Google and Therapy Notes overlays so your platform events stand out."
            data-tour="my-schedule-hide-calendars"
          >
            Hide
          </button>
          <button
            v-else
            class="sched-pill on"
            type="button"
            :disabled="loading"
            @click="showAllCalendars"
            title="Restore Google / Therapy Notes overlays to your last settings."
            data-tour="my-schedule-show-calendars"
          >
            Show
          </button>
        </div>

        <div class="sched-tool-cluster" title="How the week grid is laid out">
          <span class="sched-tool-cluster__label">Display</span>
          <button
            type="button"
            class="sched-pill"
            :class="{ on: hideWeekend }"
            role="switch"
            :aria-checked="String(!!hideWeekend)"
            :disabled="loading"
            @click="hideWeekend = !hideWeekend"
            title="Hide Saturday and Sunday columns to focus on weekdays."
            data-tour="my-schedule-hide-weekends-toggle"
          >
            Hide weekends
          </button>
          <button
            type="button"
            class="sched-pill"
            :class="{ on: showQuarterDetail }"
            role="switch"
            :aria-checked="String(!!showQuarterDetail)"
            :disabled="loading"
            @click="showQuarterDetail = !showQuarterDetail"
            title="Expand each hour into 15-minute rows so short appointments align more precisely."
          >
            15-min
          </button>
          <button
            type="button"
            class="sched-pill"
            :class="{ on: showAllHours }"
            role="switch"
            :aria-checked="String(!!showAllHours)"
            :disabled="loading"
            @click="showAllHours = !showAllHours"
            :title="showAllHours
              ? 'Collapse back to the default daytime hour band'
              : 'Show all 24 hours (midnight–11 PM) for early or late sessions'"
          >
            {{ showAllHours ? 'Day band' : '24h' }}
          </button>
        </div>
      </div>

      <div
        v-if="!showMobileDayTimeline"
        class="sched-day-focus-bar"
        title="Narrow the week grid to specific days"
      >
        <span class="sched-calendars-label">Day focus</span>
        <button
          v-for="d in focusableDays"
          :key="`focus-day-top-${d}`"
          type="button"
          class="sched-chip"
          :class="{ on: focusedDaySet.has(d) }"
          :disabled="loading"
          :title="focusedDaySet.has(d) ? `Remove ${d} from day focus` : `Show only ${d} (Cmd/Ctrl-click to multi-select)`"
          @click="toggleFocusedDay(d, $event)"
        >
          {{ d.slice(0, 3) }}
        </button>
        <button
          type="button"
          class="sched-chip"
          :disabled="loading || !focusedDays.length"
          @click="clearFocusedDays"
          title="Clear day focus and show the full week again"
        >
          Full view
        </button>
      </div>

      <details class="sched-more-tools" data-tour="my-schedule-more-tools">
        <summary class="sched-more-tools__summary" title="Therapy Notes feeds, organization filters, programs, and row height">
          More tools
          <span class="muted">feeds · organization · programs · row height</span>
        </summary>
        <div class="sched-more-tools__body">
          <div class="sched-tool-cluster sched-tool-cluster--wrap">
            <span class="sched-tool-cluster__label">Programs & layout</span>
            <button
              v-if="showCompanyEventsCalendarButton"
              type="button"
              class="sched-pill"
              :disabled="loading"
              title="Open company-wide events and school outreach opportunities"
              @click="emit('open-company-events-calendar')"
            >
              Company events
            </button>
            <button
              v-if="showSkillBuildersProgramsButton"
              type="button"
              class="sched-pill"
              :disabled="loading"
              title="Open Skill Builders events, classes, programs, and related availability"
              @click="emit('open-skill-builders-programs')"
            >
              Events / Classes / Programs
            </button>
            <button
              v-if="mode === 'self'"
              type="button"
              class="sched-pill"
              :disabled="loading"
              @click="toggleWeekStartsOn"
              title="Choose whether the week grid starts on Monday or Sunday"
            >
              Week starts: {{ effectiveWeekStartsOn === 'sunday' ? 'Sunday' : 'Monday' }}
            </button>
            <button
              v-if="!hideOfficeAndCalendarIntegration && externalCalendarsAvailable.length"
              type="button"
              class="sched-pill"
              :class="{ on: !hideExternalIcsTitles }"
              role="switch"
              :aria-checked="String(!hideExternalIcsTitles)"
              :disabled="loading || !showExternalBusy"
              title="When on, show ICS event titles on Therapy Notes busy blocks (if the feed includes titles)"
              @click="hideExternalIcsTitles = !hideExternalIcsTitles"
              data-tour="my-schedule-ehr-titles-toggle"
            >
              Therapy Notes titles
            </button>
          </div>

          <div class="sched-toolbar-secondary">
            <div class="sched-zoom-controls">
              <label class="sched-inline compact" title="Change how tall each hour row is">
                <span>Row height</span>
                <select v-model="rowHeightMode" class="sched-select compact">
                  <option value="compact">Compact</option>
                  <option value="normal">Normal</option>
                  <option value="large">Large</option>
                  <option value="xl">XL</option>
                </select>
              </label>
            </div>

            <div v-if="!hideOfficeAndCalendarIntegration" class="sched-calendars" data-tour="my-schedule-ehr-calendars">
              <div class="sched-calendars-label" title="Which Therapy Notes / ICS feeds contribute busy blocks">Therapy Notes calendars</div>
              <div class="sched-calendars-actions">
                <button type="button" class="sched-chip" :disabled="loading || !externalCalendarsAvailable.length" title="Include all connected Therapy Notes calendars" @click="selectAllExternalCalendars">All</button>
                <button type="button" class="sched-chip" :disabled="loading || !externalCalendarsAvailable.length" title="Clear all Therapy Notes calendar selections" @click="clearExternalCalendars">None</button>
                <button
                  v-if="showExternalBusy && externalCalendarsAvailable.length"
                  type="button"
                  class="sched-chip"
                  :class="{ on: hideExternalIcsTitles }"
                  :disabled="loading"
                  title="Hide event titles from ICS feeds (busy times stay visible)"
                  @click="hideExternalIcsTitles = !hideExternalIcsTitles"
                >
                  {{ hideExternalIcsTitles ? 'ICS titles off' : 'ICS titles on' }}
                </button>
              </div>
              <button
                v-for="c in externalCalendarsAvailable"
                :key="`cal-${c.id}`"
                type="button"
                class="sched-chip"
                :class="{ on: selectedExternalCalendarIds.includes(Number(c.id)) }"
                :disabled="loading || !showExternalBusy"
                :title="`Toggle busy overlay for “${c.label}”`"
                @click="toggleExternalCalendar(Number(c.id))"
              >
                {{ c.label }}
              </button>
              <div v-if="!externalCalendarsAvailable.length" class="muted" style="font-size: 12px;">
                No Therapy Notes calendars connected for this provider.
              </div>
            </div>

            <div v-if="agencyFilterOptions.length" class="sched-org-filters">
              <div class="sched-calendars-label" title="Which tenant organizations appear on this calendar">Organization</div>
              <select
                class="sched-select"
                :value="scheduleOrgScopeValue"
                :disabled="loading"
                title="Pick which organization context to emphasize when booking"
                @change="onScheduleOrganizationChange($event)"
              >
                <option :value="0">All organizations</option>
                <option v-for="opt in scheduleOrgSelectOptions" :key="`org-select-${opt.id}`" :value="Number(opt.id)">
                  {{ opt.label }}
                </option>
              </select>
              <template v-if="agencyFilterOptions.length > 1">
                <div class="sched-calendars-label" style="margin-left: 8px;">Shown</div>
                <div class="sched-calendars-actions">
                  <button type="button" class="sched-chip" :class="{ on: scheduleOrgScopeAll }" :disabled="loading" title="Show events from every organization you belong to" @click="selectAllScheduleAgencies">All</button>
                </div>
                <button
                  v-for="opt in agencyFilterOptions"
                  :key="`org-chip-${opt.id}`"
                  type="button"
                  class="sched-chip"
                  :class="{ on: activeScheduleAgencyIdSet.has(Number(opt.id)) }"
                  :disabled="loading"
                  @click="toggleScheduleAgencyFilter(Number(opt.id))"
                  :title="activeScheduleAgencyIdSet.has(Number(opt.id)) ? `Hide ${opt.label} from this schedule` : `Show ${opt.label} on this schedule`"
                  :style="activeScheduleAgencyIdSet.has(Number(opt.id)) ? { '--chipAccent': agencyBadgeColorById(opt.id) || undefined } : undefined"
                >
                  <span
                    v-if="agencyBadgeColorById(opt.id)"
                    class="sched-org-chip-dot"
                    :style="{ background: agencyBadgeColorById(opt.id) }"
                    aria-hidden="true"
                  ></span>
                  {{ opt.label }}
                </button>
              </template>
            </div>
          </div>
        </div>
      </details>

      <div v-if="!hideOfficeAndCalendarIntegration && isOfficeScopeSpecific && officeGridError" class="error" style="margin-top: 10px;">
        {{ officeGridError }}
      </div>
      <div v-else-if="!hideOfficeAndCalendarIntegration && isOfficeScopeSpecific && officeGridLoading" class="loading" style="margin-top: 10px;">
        Loading office availability…
      </div>

      <div v-if="!hideOfficeAndCalendarIntegration && isOfficeScopeSpecific && officeGrid && !officeGridLoading" class="office-quick-glance">
        <div class="office-quick-glance-head">
          <div class="office-quick-glance-title">Office at this time</div>
          <div class="office-quick-glance-controls">
            <label class="sched-inline compact">
              <span>Day</span>
              <select v-model="quickGlanceDateYmd" class="sched-select compact">
                <option v-for="opt in quickGlanceDayOptions" :key="`qg-day-${opt.value}`" :value="opt.value">{{ opt.label }}</option>
              </select>
            </label>
            <label class="sched-inline compact">
              <span>Hour</span>
              <select v-model.number="quickGlanceHour" class="sched-select compact">
                <option v-for="h in quickGlanceHourOptions" :key="`qg-hour-${h}`" :value="h">{{ hourLabel(h) }}</option>
              </select>
            </label>
            <label class="sched-inline compact">
              <span>Filter</span>
              <select v-model="quickGlanceStateFilter" class="sched-select compact">
                <option value="all">All</option>
                <option value="booked">Booked only</option>
                <option value="assigned">Assigned only</option>
                <option value="open">Open only</option>
                <option value="requested">Requested only</option>
              </select>
            </label>
          </div>
        </div>
        <div class="office-quick-glance-list">
          <div
            v-for="row in quickGlanceRows"
            :key="`qg-row-${row.roomId}`"
            class="office-quick-glance-row"
            :class="{ 'office-quick-glance-row--disabled': !row.isClickable }"
            :role="row.isClickable ? 'button' : undefined"
            :tabindex="row.isClickable ? 0 : undefined"
            @click="onQuickGlanceRowClick(row)"
            @keydown.enter="row.isClickable && onQuickGlanceRowClick(row)"
            @keydown.space.prevent="row.isClickable && onQuickGlanceRowClick(row)"
          >
            <div class="office-quick-glance-room">{{ row.roomLabel }}</div>
            <div class="office-quick-glance-status" :class="[`state-${row.state}`, row.hasPendingRequest && 'state-requested']">{{ row.statusLabel }}</div>
            <div class="office-quick-glance-provider">{{ row.providerLabel }}</div>
          </div>
          <div v-if="!quickGlanceRows.length" class="muted" style="font-size: 12px;">
            No matching rooms for this filter at the selected time.
          </div>
        </div>
      </div>
    </div>

    <div v-if="selectedActionCount > 0" class="selection-toolbar">
      <div class="selection-count">{{ selectedActionCount }} slot{{ selectedActionCount === 1 ? '' : 's' }} selected</div>
      <div class="selection-actions">
        <span class="muted" style="font-size: 12px;">Shift-click or drag to select multiple. Actions open automatically.</span>
        <button
          v-if="selectedActionCount > 1"
          class="btn btn-primary btn-sm"
          type="button"
          @click="openSlotActionModal({ ...sortedSelectedActionSlots()[0], preserveSelectionRange: true, actionSource: 'plus_or_blank' })"
        >
          Open actions
        </button>
        <button class="btn btn-secondary btn-sm" type="button" @click="clearSelectedActionSlots">
          Clear
        </button>
      </div>
    </div>

    <div v-if="joinPromptSession && !showSupvMeetTrackerModal" class="join-prompt">
      <div class="join-prompt-copy">
        <strong>Supervision starts soon:</strong>
        <span>{{ joinPromptSessionLabel }}</span>
      </div>
      <div class="join-prompt-actions">
        <button class="btn btn-primary btn-sm btn-join-pulse" type="button" :disabled="supvMeetOpening || supvAppVideoLoading" @click="joinPromptSessionNow">
          {{ (supvMeetOpening || supvAppVideoLoading) ? 'Joining…' : 'Join now' }}
        </button>
        <button class="btn btn-secondary btn-sm" type="button" @click="dismissJoinPromptForSession(joinPromptSession.id)">
          Dismiss
        </button>
      </div>
    </div>

    <!-- Office layout view (room-by-room weekly board) -->
    <div v-if="!hideOfficeAndCalendarIntegration && viewMode === 'office_layout'" class="sched-grid-wrap" data-tour="my-schedule-office-layout-panel">
      <div v-if="!isOfficeScopeSpecific" class="hint" style="margin-top: 10px;">
        Choose a specific office (not All / Off) to view the room-by-room weekly layout.
      </div>
      <div v-else-if="officeGridError" class="error" style="margin-top: 10px;">{{ officeGridError }}</div>
      <div v-else-if="officeGridLoading && !officeGrid" class="loading" style="margin-top: 10px;">Loading office availability…</div>
      <OfficeWeeklyRoomGrid
        v-else-if="officeGrid"
        :office-grid="officeGrid"
        :today-ymd="todayLocalYmd"
        :can-book="canBookFromGrid"
        :selected-keys="selectedActionKeys"
        @cell-click="onOfficeLayoutCellClick"
        @cell-mousedown="onOfficeLayoutCellMouseDown"
        @cell-mouseenter="onOfficeLayoutCellMouseEnter"
      />
    </div>

    <!-- Open finder view (existing personal grid) -->
    <template v-else>
      <div v-if="error" class="error" style="margin-top: 10px;">{{ error }}</div>
      <div v-if="loading" class="loading" style="margin-top: 10px;">Loading schedule…</div>
      <div v-if="!hideOfficeAndCalendarIntegration && googleBusyDisabledHint" class="hint" style="margin-top: 10px;">
        {{ googleBusyDisabledHint }}
      </div>
      <div
        v-if="showPeerBusyOverlay && !hideOfficeAndCalendarIntegration"
        class="peer-busy-panel"
        data-tour="my-schedule-peers-busy-panel"
      >
        <div class="peer-busy-panel__head">
          <strong>Peers</strong>
          <span class="muted" style="font-size: 12px;">
            {{ peerBusySelectedIds.length }} selected · overlays activity type (session / hold / open) and office on your grid.
            {{ canManagePeerCalendar ? 'Click a peer block to inspect or manage their calendar.' : 'For side-by-side compare, use Staff schedules.' }}
          </span>
        </div>
        <div class="peer-busy-panel__controls">
          <input
            v-model="peerBusySearch"
            class="input peer-busy-search"
            type="search"
            placeholder="Search coworkers…"
            data-tour="my-schedule-peers-busy-search"
          />
          <button class="btn btn-secondary btn-sm" type="button" :disabled="peerBusyLoading" @click="loadPeerBusyCandidates">
            {{ peerBusyLoading ? 'Loading…' : 'Refresh peers' }}
          </button>
        </div>
        <div v-if="peerBusyError" class="error" style="margin-top: 6px;">{{ peerBusyError }}</div>
        <div class="peer-busy-list">
          <label v-for="p in filteredPeerBusyCandidates" :key="`peer-${p.id}`" class="peer-busy-item">
            <input
              type="checkbox"
              :checked="peerBusySelectedIdSet.has(p.id)"
              :disabled="!peerBusySelectedIdSet.has(p.id) && peerBusySelectedIds.length >= maxPeerBusySelected"
              @change="togglePeerBusyUser(p.id)"
            />
            <img
              v-if="p.profilePhotoUrl"
              class="peer-busy-face"
              :src="p.profilePhotoUrl"
              alt=""
            />
            <span
              v-else
              class="peer-busy-face peer-busy-face--initials"
              :style="{ background: peerColorById(p.id) }"
              aria-hidden="true"
            >{{ peerInitials(p.id) }}</span>
            <span
              class="peer-busy-swatch"
              :style="{ background: peerColorById(p.id) }"
              aria-hidden="true"
            ></span>
            <img
              v-if="peerPrimaryAgencyIconUrl(p)"
              class="peer-busy-tenant-icon"
              :src="peerPrimaryAgencyIconUrl(p)"
              alt=""
            />
            <span>{{ p.label }}</span>
          </label>
          <div v-if="!filteredPeerBusyCandidates.length" class="muted" style="font-size: 12px;">
            {{ peerBusyLoading ? 'Loading coworkers…' : 'No coworkers found in your agencies.' }}
          </div>
        </div>
      </div>
      <div v-if="overlayErrorText" class="error" style="margin-top: 10px;">
        {{ overlayErrorText }}
      </div>

      <div
        v-else-if="showMobileDayTimeline"
        class="sched-day-timeline"
        data-tour="my-schedule-day-timeline"
      >
        <div class="sched-day-timeline__strip" aria-label="Pick a day">
          <button
            v-for="d in focusableDays"
            :key="`mday-${d}`"
            type="button"
            class="sched-day-timeline__chip"
            :class="{ on: mobileTimelineDay === d, today: isTodayDay(d) }"
            @click="focusedDays = [d]; scheduleSpanMode = 'day'"
          >
            <span class="sched-day-timeline__dow">{{ d.slice(0, 3) }}</span>
            <span class="sched-day-timeline__date">{{ dayDateLabel(d) }}</span>
          </button>
        </div>
        <div class="sched-day-timeline__title">
          {{ mobileTimelineDay }} · {{ dayDateLabel(mobileTimelineDay) }}
        </div>
        <div class="sched-day-timeline__hours">
          <div
            v-for="h in mobileTimelineHours"
            :key="`mhour-${h}`"
            class="sched-day-timeline__row"
          >
            <div class="sched-day-timeline__time">{{ hourLabel(h) }}</div>
            <div class="sched-day-timeline__cards">
              <button
                v-for="b in mobileDayCardsForHour(h)"
                :key="`mcard-${b.key}`"
                type="button"
                class="sched-day-card"
                :class="[
                  `cell-block-${b.kind}`,
                  b.isOfficeBlock ? `cell-block-office cell-block-office--${b.officeStatus || 'reserved'}` : '',
                  b.peerActivityType ? `cell-block-peer-${b.peerActivityType}` : ''
                ]"
                :style="cellBlockStyle(b)"
                :title="b.title"
                @click="onCellBlockClick($event, b, mobileTimelineDay, h, 0)"
              >
                <img
                  v-if="b.peerPhotoUrl && b.kind === 'peerbusy'"
                  class="cell-block-peer-face"
                  :src="b.peerPhotoUrl"
                  alt=""
                />
                <span
                  v-else-if="b.kind === 'peerbusy'"
                  class="cell-block-peer-face cell-block-peer-face--initials"
                  :style="{ background: peerColorById(b.peerUserId) }"
                >{{ peerInitials(b.peerUserId) }}</span>
                <img
                  v-if="b.agencyId && agencyIconUrlById(b.agencyId)"
                  class="cell-block-agency-icon"
                  :src="agencyIconUrlById(b.agencyId)"
                  alt=""
                />
                <div class="sched-day-card__body">
                  <div class="sched-day-card__title">
                    {{ b.isOfficeBlock ? (b.officeRoomLabel || b.shortLabel) : (b.shortLabel || b.title) }}
                  </div>
                  <div v-if="b.isOfficeBlock" class="sched-day-card__meta cell-block-office-status">
                    <svg class="cell-block-door-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 21h18" /><path d="M5 21V7l7-4v18" /><path d="M19 21V11l-7-4" />
                    </svg>
                    {{ b.officeStatusLabel }}
                    <span v-if="b.officeEmpty" class="cell-block-office-empty"> · No bookings</span>
                  </div>
                  <div v-else-if="!b.isOfficeBlock && b.kind !== 'peerbusy'" class="sched-day-card__meta muted">
                    No office / any location
                  </div>
                </div>
              </button>
              <button
                v-if="canBookFromGrid"
                type="button"
                class="sched-day-timeline__add"
                title="Add or edit this hour"
                @click="openMobileDayHour(h)"
              >+</button>
            </div>
          </div>
        </div>
        <button
          v-if="canBookFromGrid"
          type="button"
          class="sched-day-timeline__fab"
          title="Add to schedule"
          @click="openMobileDayHour(mobileTimelineHours[0] || 9)"
        >+</button>
      </div>

      <div v-else-if="summary" class="sched-grid-wrap" :class="{ 'sched-grid-wrap--hidden-mobile-day': false }">
      <div class="sched-legend" aria-label="Schedule legend">
        <template v-if="colorBlocksByTenant">
          <span
            v-for="opt in activeScheduleAgencyLegend"
            :key="`legend-org-${opt.id}`"
            class="sched-legend-chip"
          >
            <span
              v-if="agencyIconUrlById(opt.id)"
              class="sched-legend-icon-wrap"
              aria-hidden="true"
            >
              <img
                class="sched-legend-icon"
                :src="agencyIconUrlById(opt.id)"
                alt=""
              />
            </span>
            <span
              v-else
              class="sched-legend-dot"
              :style="{ background: agencyBadgeColorById(opt.id) || '#64748b' }"
              aria-hidden="true"
            ></span>
            {{ opt.label }}
          </span>
          <span class="sched-legend-chip muted" style="font-size: 11px;">Fill = organization · label = appointment type</span>
        </template>
        <template v-else-if="hideOfficeAndCalendarIntegration">
          <span class="sched-legend-chip"><span class="sched-legend-dot sched-legend-dot--sevt" aria-hidden="true"></span> Team meeting</span>
          <span class="sched-legend-chip"><span class="sched-legend-dot sched-legend-dot--request" aria-hidden="true"></span> Pending</span>
        </template>
        <template v-else>
          <span class="sched-legend-chip"><span class="sched-legend-dot sched-legend-dot--request" aria-hidden="true"></span> Requested (pending)</span>
          <span class="sched-legend-chip"><span class="sched-legend-dot sched-legend-dot--school" aria-hidden="true"></span> School assigned</span>
          <span class="sched-legend-chip"><span class="sched-legend-dot sched-legend-dot--supv sched-legend-dot--ring" aria-hidden="true"></span> Supervision</span>
          <span class="sched-legend-chip"><span class="sched-legend-dot sched-legend-dot--sevt" aria-hidden="true"></span> Schedule event</span>
          <span class="sched-legend-chip"><span class="sched-legend-dot sched-legend-dot--oa sched-legend-dot--dashed" aria-hidden="true"></span> Office reserved (empty)</span>
          <span class="sched-legend-chip"><span class="sched-legend-dot sched-legend-dot--ot sched-legend-dot--ring" aria-hidden="true"></span> Temp hold</span>
          <span class="sched-legend-chip"><span class="sched-legend-dot sched-legend-dot--ob" aria-hidden="true"></span> Office reserved (booked)</span>
          <span class="sched-legend-chip"><span class="sched-legend-dot sched-legend-dot--intake-ip sched-legend-dot--ring" aria-hidden="true"></span> In-person intake</span>
          <span class="sched-legend-chip"><span class="sched-legend-dot sched-legend-dot--intake-vi sched-legend-dot--ring" aria-hidden="true"></span> Virtual intake</span>
          <span class="sched-legend-chip"><span class="sched-legend-dot sched-legend-dot--portal sched-legend-dot--ring" aria-hidden="true"></span> Open for new clients</span>
          <span v-if="showGoogleBusy" class="sched-legend-chip"><span class="sched-legend-dot sched-legend-dot--gbusy" aria-hidden="true"></span> Google busy</span>
          <span v-if="showGoogleEvents" class="sched-legend-chip"><span class="sched-legend-dot sched-legend-dot--gevt" aria-hidden="true"></span> Google event</span>
          <span v-if="showExternalBusy && selectedExternalCalendarIds.length" class="sched-legend-chip"><span class="sched-legend-dot sched-legend-dot--ebusy" aria-hidden="true"></span> Therapy Notes busy</span>
          <span v-if="showPeerBusyOverlay" class="sched-legend-chip"><span class="sched-legend-dot sched-legend-dot--peerbusy" aria-hidden="true"></span> Peer activity (color = person)</span>
          <span class="sched-legend-chip"><span class="sched-legend-dot sched-legend-dot--agency" aria-hidden="true"></span> Agency</span>
        </template>
      </div>

      <div class="sched-grid" :style="gridStyle">
        <div class="sched-head-cell"></div>
        <div
          v-for="d in visibleDays"
          :key="d"
          class="sched-head-cell sched-head-cell-day"
          :class="{ 'sched-head-today': isTodayDay(d), 'sched-head-focused': focusedDaySet.has(d) }"
          role="button"
          tabindex="0"
          :title="focusedDaySet.has(d) ? `Focused day: ${d} (click to remove)` : `Click to focus ${d}; Cmd/Ctrl-click to multi-select days`"
          @click="toggleFocusedDay(d, $event)"
          @keydown.enter.prevent="toggleFocusedDay(d, $event)"
          @keydown.space.prevent="toggleFocusedDay(d, $event)"
        >
          <div class="sched-head-day">
            <div class="sched-head-dow">{{ d }} {{ dayDateLabel(d) }}</div>
          </div>
        </div>

        <template v-for="slot in displayTimeSlots" :key="`h-${slot.key}`">
          <div class="sched-hour" :class="{ 'sched-hour-quarter': slot.minute !== 0 }">
            {{ slot.label }}
          </div>

          <div
            v-for="d in visibleDays"
            :key="`c-${d}-${slot.key}`"
            class="sched-cell"
            :class="{ clickable: canBookFromGrid && slot.minute === 0, 'sched-cell-quarter': slot.minute !== 0, 'sched-cell-today': isTodayDay(d), 'sched-cell-selected': isActionCellSelected(d, slot.hour) && slot.minute === 0 }"
            @mousedown.left.prevent="slot.minute === 0 && onCellMouseDown(d, slot.hour, $event)"
            @mouseenter="slot.minute === 0 && onCellMouseEnter(d, slot.hour, $event)"
            @click="slot.minute === 0 && onCellClick(d, slot.hour, $event)"
            @dblclick="slot.minute === 0 && onCellDoubleClick(d, slot.hour, $event)"
            role="button"
            :tabindex="0"
            @keydown.enter.prevent="slot.minute === 0 && onCellClick(d, slot.hour, $event)"
            @keydown.space.prevent="slot.minute === 0 && onCellClick(d, slot.hour, $event)"
          >
            <button
              v-if="canBookFromGrid && slot.minute === 0"
              type="button"
              class="cell-plus-btn"
              title="Add or edit this hour"
              @click.stop="openSlotActionModal({ dayName: d, hour: slot.hour, preserveSelectionRange: false, actionSource: 'plus_or_blank' })"
            >
              +
            </button>
            <div v-if="availabilityClass(d, slot.hour, slot.minute)" class="cell-avail" :class="availabilityClass(d, slot.hour, slot.minute)"></div>
            <div
              v-if="isOfficeScopeSpecific && showOfficeOverlay && slot.minute === 0 && officeOverlay(d, slot.hour) && !cellBlocks(d, slot.hour, slot.minute).length"
              class="cell-office-overlay"
              :style="officeOverlayStyle"
              :title="officeOverlayTitle(d, slot.hour)"
            >
              {{ officeOverlay(d, slot.hour) }}
            </div>
            <div class="cell-blocks">
              <div
                v-for="b in cellBlocks(d, slot.hour, slot.minute)"
                :key="b.key"
                class="cell-block"
                :class="[
                  `cell-block-${b.kind}`,
                  b.isOfficeBlock ? `cell-block-office cell-block-office--${b.officeStatus || 'reserved'}` : '',
                  b.peerActivityType ? `cell-block-peer-${b.peerActivityType}` : '',
                  b.segmentClass ? `cell-block-segment-${b.segmentClass}` : '',
                  { 'cell-block-hovered': isBlockHovered(d, slot.hour, b), 'cell-block-peer-interactive': b.peerInteractive }
                ]"
                :title="b.title"
                :style="cellBlockStyle(b)"
                @mouseenter="hoveredBlockKey = blockKey(d, slot.hour, b)"
                @mouseleave="hoveredBlockKey = ''"
                @click="onCellBlockClick($event, b, d, slot.hour, slot.minute)"
                @dblclick="onCellBlockDoubleClick($event, b, d, slot.hour, slot.minute)"
              >
                <span
                  v-if="colorBlocksByTenant"
                  class="cell-block-type-stripe"
                  aria-hidden="true"
                ></span>
                <img
                  v-if="b.peerPhotoUrl && b.kind === 'peerbusy'"
                  class="cell-block-peer-face"
                  :src="b.peerPhotoUrl"
                  alt=""
                  :title="b.title"
                />
                <span
                  v-else-if="b.kind === 'peerbusy' && b.shortLabel"
                  class="cell-block-peer-face cell-block-peer-face--initials"
                  :style="{ background: peerColorById(b.peerUserId) }"
                  aria-hidden="true"
                >{{ peerInitials(b.peerUserId) }}</span>
                <img
                  v-if="hasAgencyBadge(b) && !b.hideAgencyDot && agencyIconUrlById(b.agencyId)"
                  class="cell-block-agency-icon"
                  :src="agencyIconUrlById(b.agencyId)"
                  alt=""
                  :title="agencyBadgeTitle(b)"
                />
                <span
                  v-else-if="hasAgencyBadge(b) && !b.hideAgencyDot && !colorBlocksByTenant && b.kind !== 'peerbusy'"
                  class="cell-block-agency-dot"
                  :style="agencyBadgeStyle(b)"
                  :title="agencyBadgeTitle(b)"
                ></span>
                <template v-if="b.isOfficeBlock">
                  <span class="cell-block-office-body">
                    <span class="cell-block-text">{{ b.officeRoomLabel || b.shortLabel }}</span>
                    <span class="cell-block-office-status" :title="b.officeStatusLabel">
                      <svg class="cell-block-door-icon" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 21h18" /><path d="M5 21V7l7-4v18" /><path d="M19 21V11l-7-4" /><circle cx="10" cy="12" r="0.8" fill="currentColor" stroke="none" />
                      </svg>
                      <span class="cell-block-office-status-text">{{ b.officeStatusLabel }}</span>
                    </span>
                    <span v-if="b.officeEmpty && visibleDays.length === 1" class="cell-block-office-empty">No bookings</span>
                  </span>
                </template>
                <span v-else-if="b.shortLabel && b.kind !== 'peerbusy'" class="cell-block-text">{{ b.shortLabel }}</span>
                <span v-else-if="b.kind === 'peerbusy' && b.shortLabel" class="cell-block-text">{{ peerActivityShortFromBlock(b) }}</span>
                <span
                  v-if="b.hasPendingRequest"
                  class="cell-block-pending-badge"
                  :title="b.pendingRequestCount > 1 ? `${b.pendingRequestCount} pending requests` : 'Pending request'"
                >{{ b.pendingRequestCount > 1 ? `Req×${b.pendingRequestCount}` : 'Req' }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
      </div>
    </template>

    <!-- Read-only slot info modal for non-admin users viewing someone else's booked slot -->
    <div v-if="showSlotInfoModal" class="modal-backdrop modal-backdrop--request" @click.self="showSlotInfoModal = false">
      <div class="modal modal--new-request modal--stack-details modal--slot-info" style="max-width: 520px;">
        <div class="nr-head">
          <div class="nr-head-main">
            <div class="nr-head-copy">
              <div class="nr-title">Office booking info</div>
              <div class="nr-subtitle">Frequency and assignment details for this slot</div>
            </div>
          </div>
          <div class="nr-head-context">
            <button class="nr-close" type="button" aria-label="Close" @click="showSlotInfoModal = false">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M6 6l12 12M18 6L6 18"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="nr-chooser" v-if="slotInfoModalData">
        <div class="slot-info-card">
          <div class="slot-info-row">
            <span class="slot-info-label">Room</span>
            <span class="slot-info-value">{{ slotInfoModalData.roomLabel }}</span>
          </div>
          <div class="slot-info-row">
            <span class="slot-info-label">Provider</span>
            <span class="slot-info-value slot-info-value--provider">{{ slotInfoModalData.providerLabel || '—' }}</span>
          </div>
          <div class="slot-info-row" v-if="slotInfoModalData.slot?.assignedFrequency || slotInfoModalData.slot?.frequencyLabel || slotInfoModalData.slot?.bookedFrequency">
            <span class="slot-info-label">Booking</span>
            <span class="slot-info-value">
              {{ slotInfoModalData.slot?.frequencyLabel || (slotInfoModalData.slot?.assignedFrequency === 'WEEKLY' ? 'Weekly' : slotInfoModalData.slot?.assignedFrequency === 'BIWEEKLY' ? 'Biweekly' : slotInfoModalData.slot?.assignedFrequency === 'MONTHLY' ? 'Monthly' : slotInfoModalData.slot?.assignedFrequency || '—') }}
            </span>
          </div>
          <div class="slot-info-row" v-if="slotInfoModalData.slot?.bookingActiveUntilDate || slotInfoModalData.slot?.assignmentTemporaryUntilDate">
            <span class="slot-info-label">Booked until</span>
            <span class="slot-info-value">{{ slotInfoModalData.slot?.bookingActiveUntilDate || slotInfoModalData.slot?.assignmentTemporaryUntilDate }}</span>
          </div>
          <div class="slot-info-row" v-if="slotInfoModalData.slot?.appointmentType && slotInfoModalData.slot?.appointmentType !== 'NONE'">
            <span class="slot-info-label">Session type</span>
            <span class="slot-info-value">{{ slotInfoModalData.slot.appointmentType }}</span>
          </div>
          <div class="slot-info-row" v-if="slotInfoModalData.slot?.modality">
            <span class="slot-info-label">Modality</span>
            <span class="slot-info-value">{{ slotInfoModalData.slot.modality }}</span>
          </div>
          <div class="slot-info-row" v-if="slotInfoModalData.slot?.serviceCode">
            <span class="slot-info-label">Service</span>
            <span class="slot-info-value">{{ slotInfoModalData.slot.serviceCode }}</span>
          </div>
          <div class="slot-info-row">
            <span class="slot-info-label">Status</span>
            <span class="slot-info-value slot-info-status" :class="`slot-info-status--${slotInfoModalData.state}`">{{ slotInfoModalData.statusLabel }}</span>
          </div>
        </div>
        </div>
      </div>
    </div>

    <div v-if="showRequestModal" class="modal-backdrop modal-backdrop--request" data-schedule-ui="v2" @click.self="requestCloseModal">
      <div
        class="modal modal--request modal--new-request"
        :class="{ 'modal--chooser': showActionChooser || isAppointmentEditMode }"
        role="dialog"
        aria-labelledby="nr-title"
      >
        <div class="nr-head">
          <div class="nr-head-main">
            <span class="nr-head-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                <rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" stroke-width="1.8"/>
                <path d="M3 10h18" stroke="currentColor" stroke-width="1.8"/>
                <path d="M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M12 13v5M9.5 15.5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </span>
            <div class="nr-head-copy">
              <div id="nr-title" class="nr-title">Schedule</div>
              <div class="nr-subtitle">{{ modalScheduleSubtitle }}</div>
            </div>
          </div>
          <div class="nr-head-context" data-testid="schedule-modal-context">
            <button
              v-if="isPickScheduleEventMode || (isScheduleEventEditMode && stackDetailsItems.length > 1)"
              type="button"
              class="nr-back-chooser"
              @click="requestType = 'pick_schedule_event'; scheduleEventEditId = 0"
            >
              ← All items
            </button>
            <button
              v-else-if="!showActionChooser && !isAppointmentEditMode"
              type="button"
              class="nr-back-chooser"
              @click="goBackToActionChooser"
            >
              ← All actions
            </button>
            <button class="nr-close" type="button" aria-label="Close" @click="requestCloseModal">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M6 6l12 12M18 6L6 18"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Shared editable slot header (chooser + form modes + appointment edit) -->
        <div
          class="nr-slot-header"
          :class="{ 'nr-slot-header--form': !showActionChooser }"
          data-testid="schedule-slot-editor"
        >
          <div class="nr-info-bar nr-info-bar--edit">
            <div class="nr-info-cell nr-info-cell--when">
              <span class="nr-info-label">When</span>
              <template v-if="isScheduleEventEditMode">
                <div class="nr-when-edit nr-when-edit--datetime">
                  <input v-model="scheduleEventEditForm.startAt" class="nr-info-select" type="datetime-local" />
                  <span class="nr-when-sep">–</span>
                  <input v-model="scheduleEventEditForm.endAt" class="nr-info-select" type="datetime-local" />
                </div>
                <span v-if="bookingTimezoneLabel" class="nr-tz-under">{{ bookingTimezoneLabel }}</span>
              </template>
              <template v-else-if="isSupervisionEditMode">
                <div class="nr-when-edit nr-when-edit--datetime">
                  <input v-model="supvStartIsoLocal" class="nr-info-select" type="datetime-local" />
                  <span class="nr-when-sep">–</span>
                  <input v-model="supvEndIsoLocal" class="nr-info-select" type="datetime-local" />
                </div>
                <span v-if="bookingTimezoneLabel" class="nr-tz-under">{{ bookingTimezoneLabel }}</span>
              </template>
              <template v-else>
                <div class="nr-when-edit">
                  <select
                    v-model="modalDay"
                    class="nr-info-select nr-info-select--day"
                    :disabled="!canManageOffices && !canSelectBookingProvider"
                    title="Day"
                    @change="onChooserWhenChanged"
                  >
                    <option v-for="d in orderedDays" :key="`nr-day-${d}`" :value="d">{{ d }}</option>
                  </select>
                  <select
                    v-model.number="modalHour"
                    class="nr-info-select nr-info-select--time"
                    title="Start"
                    @change="onChooserWhenChanged"
                  >
                    <option v-for="h in startHourOptions" :key="`nr-start-${h}`" :value="h">{{ hourLabel(h) }}</option>
                  </select>
                  <span class="nr-when-sep">–</span>
                  <select
                    v-model.number="modalEndHour"
                    class="nr-info-select nr-info-select--time"
                    title="End"
                    @change="onChooserWhenChanged"
                  >
                    <option v-for="h in endHourOptions" :key="`nr-end-${h}`" :value="h">{{ hourLabel(h) }}</option>
                  </select>
                </div>
                <span class="nr-duration-under">{{ modalDurationLabel }}</span>
                <span v-if="bookingTimezoneLabel" class="nr-tz-under">{{ bookingTimezoneLabel }}</span>
              </template>
            </div>
            <div class="nr-info-cell nr-info-cell--tenant">
              <span class="nr-info-label">Tenant</span>
              <div class="nr-tenant-row">
                <img
                  v-if="agencyIconUrlById(isScheduleEventEditMode ? scheduleEventEditForm.agencyId : (selectedActionAgencyId || effectiveAgencyId))"
                  class="nr-tenant-logo"
                  :src="agencyIconUrlById(isScheduleEventEditMode ? scheduleEventEditForm.agencyId : (selectedActionAgencyId || effectiveAgencyId))"
                  alt=""
                />
                <select
                  v-if="isScheduleEventEditMode"
                  v-model.number="scheduleEventEditForm.agencyId"
                  class="nr-info-select"
                  @change="onScheduleEventEditAgencyChange"
                >
                  <option :value="0">{{ scheduleEventOrgNoneLabel }}</option>
                  <option v-for="opt in scheduleEventOrgOptions" :key="`nr-edit-org-${opt.id}`" :value="Number(opt.id)">
                    {{ opt.label }}
                  </option>
                </select>
                <select
                  v-else-if="headerTenantOptions.length > 1"
                  v-model.number="selectedActionAgencyId"
                  class="nr-info-select"
                  @change="onBookingAgencyChange"
                >
                  <option v-for="opt in headerTenantOptions" :key="`nr-info-tenant-${opt.id}`" :value="Number(opt.id)">
                    {{ opt.label }}
                  </option>
                </select>
                <span v-else class="nr-info-value">{{ modalTenantLabel }}</span>
              </div>
            </div>
            <div class="nr-info-cell nr-info-cell--provider">
              <span class="nr-info-label">{{ isAppointmentEditMode ? 'Booked for' : 'Provider' }}</span>
              <PersonSearchSelect
                v-if="canSelectBookingProvider && !isAppointmentEditMode"
                :model-value="bookingTargetUserId"
                :options="bookingProviderPickerOptions"
                placeholder="Type a name to search…"
                :disabled="bookingProvidersLoading"
                :show-photos="true"
                class="nr-info-person"
                @update:model-value="setBookingTargetUser"
              />
              <div v-else class="nr-provider-readonly">
                <img
                  v-if="assignedProviderFace?.photoUrl"
                  class="nr-provider-face"
                  :src="assignedProviderFace.photoUrl"
                  alt=""
                />
                <span
                  v-else
                  class="nr-provider-face nr-provider-face--initials"
                  aria-hidden="true"
                >{{ providerInitials(assignedProviderFace || { first_name: bookingTargetUserLabel }) }}</span>
                <span class="nr-info-value">{{ bookingTargetUserLabel }}</span>
              </div>
            </div>
          </div>
          <div
            v-if="isScheduleEventEditMode && editingScheduleStackItem"
            class="nr-booking-strip"
            data-testid="schedule-appt-meta"
          >
            <div class="nr-booking-strip-cell">
              <span class="nr-info-label">Type</span>
              <span class="nr-info-value">{{ editingScheduleStackItem.kindLabel || appointmentEditKindLabel }}</span>
            </div>
            <div v-if="!isMeetingStackItem(editingScheduleStackItem)" class="nr-booking-strip-cell">
              <span class="nr-info-label">Client</span>
              <select
                v-model.number="scheduleEventEditForm.clientId"
                class="nr-info-select"
                :disabled="virtualSessionClientsLoading"
              >
                <option :value="0">— None —</option>
                <option
                  v-for="c in scheduleEventEditClientOptions"
                  :key="`nr-edit-client-${c.id}`"
                  :value="Number(c.id)"
                >
                  {{ c.displayName || c.fullName || `Client #${c.id}` }}
                </option>
              </select>
            </div>
            <div v-else class="nr-booking-strip-cell">
              <span class="nr-info-label">Coworkers</span>
              <span class="nr-info-value">{{ selectedMeetingParticipantIdSet.size }} selected</span>
            </div>
            <div class="nr-booking-strip-cell">
              <span class="nr-info-label">Booked for</span>
              <span class="nr-info-value">{{ bookingTargetUserLabel }}</span>
            </div>
          </div>
          <div
            v-else-if="isSupervisionEditMode"
            class="nr-booking-strip"
            data-testid="schedule-supv-meta"
          >
            <div class="nr-booking-strip-cell">
              <span class="nr-info-label">Type</span>
              <span class="nr-info-value">Supervision</span>
            </div>
            <div class="nr-booking-strip-cell">
              <span class="nr-info-label">Participant</span>
              <span class="nr-info-value">{{ selectedSupvSession?.counterpartyName || '—' }}</span>
            </div>
            <div class="nr-booking-strip-cell">
              <span class="nr-info-label">Booked for</span>
              <span class="nr-info-value">{{ bookingTargetUserLabel }}</span>
            </div>
            <div class="nr-booking-strip-cell">
              <span class="nr-info-label">Status</span>
              <span class="nr-info-value">Scheduled</span>
            </div>
          </div>
          <div
            v-if="modalOccupiedSlotSummary.showBookingMeta && !isAppointmentEditMode"
            class="nr-booking-strip"
            :class="{ 'nr-booking-strip--edit': canEditBookingStrip }"
            data-testid="schedule-booking-meta"
          >
            <div class="nr-booking-strip-cell">
              <span class="nr-info-label">Booking</span>
              <select
                v-if="canEditBookingStrip"
                v-model="bookingStripFrequency"
                class="nr-info-select"
                :disabled="bookingStripSaving"
              >
                <option value="ONCE">Once</option>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Biweekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
              <span v-else class="nr-info-value">{{ modalOccupiedSlotSummary.frequencyLabel || '—' }}</span>
            </div>
            <div class="nr-booking-strip-cell">
              <span class="nr-info-label">Status</span>
              <select
                v-if="canEditBookingStrip"
                v-model="bookingStripStatus"
                class="nr-info-select"
                :disabled="bookingStripSaving"
              >
                <option value="BOOKED">Booked</option>
                <option value="ASSIGNED">Assigned</option>
                <option value="TEMPORARY">Temporary</option>
              </select>
              <span v-else class="nr-info-value">{{ modalOccupiedSlotSummary.statusLabel || '—' }}</span>
            </div>
            <div class="nr-booking-strip-cell">
              <span class="nr-info-label">Booked until</span>
              <input
                v-if="canEditBookingStrip"
                v-model="bookingStripUntil"
                class="nr-info-select"
                type="date"
                :disabled="bookingStripSaving || bookingStripFrequency === 'ONCE'"
                :title="bookingStripFrequency === 'ONCE' ? 'One-time bookings apply to this occurrence only' : 'Leave blank for ongoing'"
              />
              <span v-else class="nr-info-value">{{ modalOccupiedSlotSummary.bookedUntilLabel || '—' }}</span>
            </div>
            <div class="nr-booking-strip-cell">
              <span class="nr-info-label">Room</span>
              <span class="nr-info-value">{{ modalOccupiedSlotSummary.roomDisplay || '—' }}</span>
            </div>
            <div
              v-if="canEditBookingStrip"
              class="nr-booking-strip-actions"
            >
              <button
                type="button"
                class="btn btn-primary btn-sm stack-details-edit-btn"
                :disabled="bookingStripSaving || !bookingStripDirty"
                @click="saveBookingStripEdits"
              >
                {{ bookingStripSaving ? 'Saving…' : 'Update booking' }}
              </button>
              <div v-if="bookingStripError" class="error" style="margin-top: 4px; font-size: 12px;">{{ bookingStripError }}</div>
            </div>
          </div>
        </div>

        <!-- Appointment edit (Session / Personal / Meeting / Supervision) — same Schedule shell -->
        <div v-if="isAppointmentEditMode" class="nr-chooser nr-appt-edit-body" data-testid="schedule-appointment-edit">
          <div v-if="isPickScheduleEventMode">
            <div class="nr-chooser-intro">
              <div>
                <div class="nr-chooser-title">Which item do you want to edit?</div>
                <p class="nr-chooser-help">Multiple items overlap this time. Pick one to open in the Schedule editor.</p>
              </div>
            </div>
            <div class="nr-action-grid">
              <button
                v-for="item in stackDetailsItems"
                :key="`pick-${item.id}`"
                type="button"
                class="nr-card"
                @click="pickScheduleEventForEdit(item)"
              >
                <span class="nr-card-label">{{ item.kindLabel || 'Item' }}</span>
                <span class="nr-card-desc">{{ item.label }}{{ item.subLabel ? ` · ${item.subLabel}` : '' }}</span>
                <span class="nr-card-chevron" aria-hidden="true">›</span>
              </button>
            </div>
          </div>

          <template v-else-if="isScheduleEventEditMode && editingScheduleStackItem">
            <div v-if="scheduleEventEditError" class="error" style="margin-bottom: 10px;">{{ scheduleEventEditError }}</div>
            <label class="lbl">Title</label>
            <input v-model="scheduleEventEditForm.title" class="input" type="text" maxlength="200" />
            <label class="lbl" style="margin-top: 10px;">Notes / description</label>
            <textarea
              v-model="scheduleEventEditForm.description"
              class="input"
              rows="3"
              maxlength="4000"
              placeholder="Optional notes for this event…"
            />

            <template v-if="isMeetingStackItem(editingScheduleStackItem)">
              <label class="lbl" style="margin-top: 14px;">Coworkers (agency staff)</label>
              <div v-if="meetingCandidatesLoading" class="muted" style="margin-top: 4px;">Loading coworkers…</div>
              <template v-else>
                <input
                  v-model="meetingParticipantSearch"
                  class="input"
                  type="text"
                  placeholder="Search coworkers by name or email"
                  style="margin-bottom: 8px;"
                />
                <div v-if="selectedMeetingParticipantChips.length" class="supervision-selected-chips">
                  <button
                    v-for="chip in selectedMeetingParticipantChips"
                    :key="`nr-meeting-chip-${chip.id}`"
                    type="button"
                    class="supervision-chip"
                    @click="removeSelectedMeetingParticipant(chip.id)"
                  >
                    <span>{{ supervisionParticipantLabel(chip.row || { id: chip.id }) }}</span>
                    <span aria-hidden="true">x</span>
                  </button>
                </div>
                <div class="participant-scroll" style="margin-top: 6px; max-height: 200px;">
                  <div class="participant-grid">
                    <button
                      v-for="p in filteredMeetingCandidates"
                      :key="`nr-meeting-p-${p.id}`"
                      type="button"
                      class="participant-card participant-card--rich"
                      :class="{ on: selectedMeetingParticipantIdSet.has(Number(p.id)) }"
                      @click="toggleMeetingParticipant(Number(p.id))"
                    >
                      <img
                        v-if="participantPhotoUrl(p)"
                        class="participant-face"
                        :src="participantPhotoUrl(p)"
                        alt=""
                      />
                      <span
                        v-else
                        class="participant-face participant-face--initials"
                        aria-hidden="true"
                      >{{ providerInitials(p) }}</span>
                      <span class="participant-copy">
                        <span class="participant-name">{{ supervisionParticipantLabel(p) }}</span>
                        <span class="participant-role">{{ String(p.role || '').trim() || 'provider' }}</span>
                      </span>
                    </button>
                  </div>
                </div>
              </template>
            </template>

            <label class="sched-toggle" style="margin-top: 12px;">
              <input type="checkbox" v-model="scheduleEventEditForm.isPrivate" />
              <span>Private on calendar</span>
            </label>

            <div
              v-if="editingScheduleStackItem.appJoinUrl || editingScheduleStackItem.meetLink"
              style="margin-top: 14px; display: flex; gap: 8px; flex-wrap: wrap;"
            >
              <a
                v-if="editingScheduleStackItem.appJoinUrl || editingScheduleStackItem.meetLink"
                class="btn btn-secondary btn-sm"
                :href="editingScheduleStackItem.appJoinUrl || editingScheduleStackItem.meetLink"
                target="_blank"
                rel="noreferrer"
              >
                {{ editingScheduleStackItem.appJoinUrl ? 'Open video room' : 'Open meeting link' }}
              </a>
            </div>
          </template>

          <template v-else-if="isSupervisionEditMode">
            <div v-if="supvModalError" class="error" style="margin-bottom: 10px;">{{ supvModalError }}</div>
            <div v-if="supvOptions.length > 1" style="margin-bottom: 10px;">
              <label class="lbl">Session</label>
              <select v-model.number="selectedSupvSessionId" class="input">
                <option v-for="o in supvOptions" :key="`nr-supv-opt-${o.id}`" :value="o.id">{{ o.label }}</option>
              </select>
            </div>
            <label class="lbl">Notes</label>
            <textarea v-model="supvNotes" class="input" rows="4" placeholder="Optional notes for the Google Calendar description…" />
            <div v-if="selectedSupvSession?.joinUrl || selectedSupvSession?.googleMeetLink" style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
              <button
                class="btn btn-primary btn-sm"
                type="button"
                :disabled="supvMeetOpening || supvAppVideoLoading"
                @click="startTrackedSupvMeet"
              >
                {{ (supvMeetOpening || supvAppVideoLoading) ? 'Joining…' : (selectedSupvSession?.joinUrl ? 'Join with app' : 'Join Meet (tracked)') }}
              </button>
              <a
                class="btn btn-secondary btn-sm"
                :href="selectedSupvSession?.joinUrl || selectedSupvSession?.googleMeetLink"
                target="_blank"
                rel="noreferrer"
              >
                Open in new tab
              </a>
              <button
                class="btn btn-secondary btn-sm"
                type="button"
                :disabled="!selectedSupvSessionId"
                @click="showAgendaPanel = true"
              >
                Agenda
              </button>
            </div>
            <div style="margin-top: 14px; border: 1px solid var(--nr-line); border-radius: 12px; padding: 12px; background: var(--nr-soft);">
              <label class="lbl">Transcript link</label>
              <input v-model="supvTranscriptUrl" class="input" type="url" placeholder="https://... transcript link" />
              <label class="lbl" style="margin-top: 8px;">Transcript text</label>
              <textarea v-model="supvTranscriptText" class="input" rows="3" placeholder="Paste transcript text so Gemini can generate a summary." />
              <label class="lbl" style="margin-top: 8px;">Summary</label>
              <textarea v-model="supvSummaryText" class="input" rows="3" placeholder="Session summary" />
              <div style="margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap;">
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  :disabled="supvArtifactSaving || supvArtifactLoading || !selectedSupvSessionId"
                  @click="saveSupvArtifact({ autoSummarize: false })"
                >
                  {{ supvArtifactSaving ? 'Saving…' : 'Save transcript + summary' }}
                </button>
                <button
                  class="btn btn-primary btn-sm"
                  type="button"
                  :disabled="supvArtifactSaving || supvArtifactLoading || !selectedSupvSessionId || !supvTranscriptText.trim()"
                  @click="saveSupvArtifact({ autoSummarize: true })"
                >
                  Generate summary with Gemini
                </button>
              </div>
            </div>
          </template>
        </div>

        <!-- Chooser: action cards -->
        <div v-else-if="showActionChooser" class="nr-chooser" data-testid="schedule-action-chooser">
          <div class="nr-chooser-intro">
            <div>
              <div class="nr-chooser-title">What would you like to do?</div>
              <p class="nr-chooser-help">Choose an option to manage this time slot. Most-used actions rise to the top.</p>
            </div>
            <button
              type="button"
              class="nr-reorder-toggle"
              :class="{ on: slotActionReorderMode }"
              @click="slotActionReorderMode = !slotActionReorderMode"
            >
              {{ slotActionReorderMode ? 'Done reordering' : 'Reorder' }}
            </button>
          </div>

          <div class="nr-action-grid">
            <button
              v-if="canUnrequestAllPending"
              type="button"
              class="nr-card"
              :disabled="submitting"
              @click="unrequestAllPendingRequests({ keepModalOpen: true })"
            >
              <span class="nr-card-icon tone-cyan" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7">
                  <path d="M4 8h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" />
                  <path d="M9 13h6" stroke-linecap="round"/>
                </svg>
              </span>
              <span class="nr-card-label">Unrequest all pending ({{ pendingRequestTotalCount }})</span>
              <span class="nr-card-desc">Clear outstanding requests for this range</span>
            </button>

            <button
              v-for="act in displayedChooserActions"
              :key="`chooser-${act.id}`"
              type="button"
              class="nr-card"
              :class="[`tone-${act.tone || 'slate'}`, { disabled: !!act.disabledReason }]"
              :disabled="!!act.disabledReason && !slotActionReorderMode"
              :title="act.disabledReason || act.description"
              :draggable="slotActionReorderMode"
              @click="!slotActionReorderMode && onQuickActionSelect(act)"
              @dragstart="onChooserDragStart(act.id, $event)"
              @dragover.prevent
              @drop.prevent="onChooserDrop(act.id)"
            >
              <span class="nr-card-icon" :class="`tone-${act.tone || 'slate'}`" aria-hidden="true">
                <svg v-if="quickActionIconKey(act.id) === 'office'" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7">
                  <path d="M4 20V7a2 2 0 0 1 2-2h5v15H4zM13 20V4h5a2 2 0 0 1 2 2v14h-7z"/>
                </svg>
                <svg v-else-if="quickActionIconKey(act.id) === 'session'" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7">
                  <circle cx="12" cy="8" r="3.2"/>
                  <path d="M5 19c1-3.5 3.4-5.2 7-5.2S18 15.5 19 19"/>
                </svg>
                <svg v-else-if="quickActionIconKey(act.id) === 'portal'" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7">
                  <rect x="3" y="5" width="18" height="14" rx="2"/>
                  <path d="M3 10h18" stroke-linecap="round"/>
                </svg>
                <svg v-else-if="quickActionIconKey(act.id) === 'meeting'" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7">
                  <circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/>
                  <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5S14 16 14.5 19"/>
                </svg>
                <svg v-else-if="quickActionIconKey(act.id) === 'hold'" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7">
                  <circle cx="12" cy="12" r="8"/>
                  <path d="M12 8v5l3 2" stroke-linecap="round"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7">
                  <rect x="3" y="5" width="18" height="15" rx="2"/>
                  <path d="M3 10h18" stroke-linecap="round"/>
                </svg>
              </span>
              <span class="nr-card-label">{{ quickActionDisplayLabel(act) }}</span>
              <span class="nr-card-desc">{{ act.disabledReason || quickActionDisplayDescription(act) }}</span>
              <span v-if="slotActionReorderMode" class="nr-card-reorder">
                <button type="button" class="nr-move" title="Move earlier" @click.stop="moveChooserAction(act.id, -1)">↑</button>
                <button type="button" class="nr-move" title="Move later" @click.stop="moveChooserAction(act.id, 1)">↓</button>
              </span>
              <span v-else class="nr-card-chevron" aria-hidden="true">›</span>
            </button>

            <button
              v-if="moreQuickActions.length && !showMoreSlotActions"
              type="button"
              class="nr-card nr-card--more"
              @click="showMoreSlotActions = true"
            >
              <span class="nr-card-icon tone-slate" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7">
                  <circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="18" cy="12" r="1.5" fill="currentColor"/>
                </svg>
              </span>
              <span class="nr-card-label">More Actions</span>
              <span class="nr-card-desc">{{ moreQuickActions.length }} additional option{{ moreQuickActions.length === 1 ? '' : 's' }}</span>
              <span class="nr-card-chevron" aria-hidden="true">›</span>
            </button>
          </div>

          <div v-if="!visibleQuickActions.length" class="nr-empty-actions">
            No actions are available for this slot.
          </div>

          <div class="nr-chooser-foot">
            <p class="nr-chooser-tip">
              Everything you need, in one place. Notes belong to a session — open a booked session to write or edit notes.
            </p>
            <button type="button" class="btn nr-btn-today" @click="goToTodayWeek(); requestCloseModal();">
              View Today’s Schedule
            </button>
          </div>
        </div>

        <div v-else class="nr-layout">
          <aside class="nr-sidebar nr-sidebar--compact">
            <div class="nr-sidebar-title">Actions</div>
            <div class="nr-action-list">
              <button
                v-for="act in visibleQuickActions"
                :key="`act-${act.id}`"
                type="button"
                class="nr-action"
                :class="[{ on: requestType === act.id }, `icon-${quickActionIconKey(act.id)}`]"
                :disabled="!!act.disabledReason"
                :title="act.disabledReason || act.description"
                @click="onQuickActionSelect(act)"
              >
                <span class="nr-action-icon" :class="`tone-${act.tone || 'slate'}`" aria-hidden="true">
                  <svg v-if="quickActionIconKey(act.id) === 'office'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7">
                    <path d="M4 20V7a2 2 0 0 1 2-2h5v15H4zM13 20V4h5a2 2 0 0 1 2 2v14h-7z"/>
                  </svg>
                  <svg v-else-if="quickActionIconKey(act.id) === 'session'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7">
                    <circle cx="12" cy="8" r="3.2"/>
                    <path d="M5 19c1-3.5 3.4-5.2 7-5.2S18 15.5 19 19"/>
                  </svg>
                  <svg v-else-if="quickActionIconKey(act.id) === 'portal'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7">
                    <circle cx="12" cy="12" r="8"/>
                    <path d="M4 12h16" stroke-linecap="round"/>
                  </svg>
                  <svg v-else-if="quickActionIconKey(act.id) === 'meeting'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7">
                    <circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/>
                    <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5S14 16 14.5 19"/>
                  </svg>
                  <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7">
                    <rect x="3" y="5" width="18" height="15" rx="2"/>
                    <path d="M3 10h18" stroke-linecap="round"/>
                  </svg>
                </span>
                <span class="nr-action-copy">
                  <span class="nr-action-label">{{ quickActionDisplayLabel(act) }}</span>
                  <span class="nr-action-desc">{{ act.disabledReason || quickActionDisplayDescription(act) }}</span>
                </span>
              </button>
            </div>
          </aside>

          <div class="nr-main modal-body">
          <div
            v-if="showInitialBookingContext"
            class="nr-context-card"
            data-testid="schedule-modal-initial-context"
          >
            <div class="nr-context-card-title">Who are you scheduling for?</div>
            <p class="nr-context-card-help">
              Choose the tenant and provider before continuing.
            </p>
            <div class="nr-context-card-grid">
              <div v-if="headerTenantOptions.length" class="nr-field">
                <label class="lbl">Tenant</label>
                <select
                  v-model.number="selectedActionAgencyId"
                  class="input"
                  :disabled="headerTenantOptions.length <= 1"
                  @change="onBookingAgencyChange"
                >
                  <option v-for="opt in headerTenantOptions" :key="`nr-body-tenant-${opt.id}`" :value="Number(opt.id)">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
              <div v-if="canSelectBookingProvider" class="nr-field">
                <label class="lbl">Provider</label>
                <PersonSearchSelect
                  :model-value="bookingTargetUserId"
                  :options="bookingProviderPickerOptions"
                  placeholder="Type a name to search…"
                  :disabled="bookingProvidersLoading"
                  :show-photos="true"
                  @update:model-value="setBookingTargetUser"
                />
              </div>
              <div v-else class="nr-field">
                <label class="lbl">Provider</label>
                <div class="nr-provider-readonly">
                  <img
                    v-if="assignedProviderFace?.photoUrl"
                    class="nr-provider-face"
                    :src="assignedProviderFace.photoUrl"
                    alt=""
                  />
                  <div class="nr-context-readonly">{{ bookingTargetUserLabel }}</div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="showActionAgencyPicker && !showInitialBookingContext && !isSessionBookingRequestType" class="nr-field">
            <label class="lbl">{{ requestType === 'portal_intake' ? 'Tenant' : 'Agency for this action' }}</label>
            <div class="nr-input-wrap">
              <span class="nr-input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7">
                  <path d="M4 20V8l4-3 4 3v12H4zM12 20V6l4-2 4 2v14h-8z"/>
                </svg>
              </span>
              <select
                v-model.number="selectedActionAgencyId"
                class="input nr-input"
                :disabled="!canChangeActionAgency && headerTenantOptions.length <= 1"
                @change="onBookingAgencyChange"
              >
                <option
                  v-for="opt in (isSessionBookingRequestType ? headerTenantOptions : actionAgencyOptions)"
                  :key="`action-agency-${opt.id}`"
                  :value="Number(opt.id)"
                >
                  {{ opt.label }}
                </option>
              </select>
            </div>
            <div class="muted nr-help">
              <template v-if="headerTenantOptions.length <= 1 && !canChangeActionAgency">
                Only one organization is available for this account/context.
              </template>
              <template v-else-if="actionAgencyFilteredToOffice && !isSessionBookingRequestType">
                Only organizations linked to this office are listed
                <template v-if="isScheduleSuperAdmin"> (superadmin can pick any linked tenant)</template>
                <template v-else> (and that you belong to)</template>.
              </template>
              <template v-else>
                Clients, service codes, and video sessions use this organization.
              </template>
            </div>
          </div>

          <!-- Slot details: summary lives in the green header; main pane stays action-focused -->
          <div v-if="requestType === 'slot_details'" class="slot-details-panel">
            <div class="slot-details-lead">
              Use the actions on the left to book, forfeit, reassign, or cancel this selection.
            </div>
          </div>

          <div v-if="requestType === 'school' && !schoolWindowValid" class="nr-warn">
            School daytime availability must be on weekdays between 6 AM and 6 PM.
          </div>
          <div v-if="requestType === 'portal_intake'" class="nr-info-banner">
            <strong>Not tied to an office.</strong>
            This publishes virtual intake hours to the online portal so new clients can request time.
            You can still request an office for the same window below if you want a room later.
            <label
              v-if="Number(selectedOfficeLocationId || 0) > 0"
              class="sched-toggle"
              style="margin-top: 10px; display: flex;"
            >
              <input type="checkbox" v-model="sessionAlsoRequestOffice" />
              <span>Also request an office for this time (optional)</span>
            </label>
            <div v-else class="muted nr-help" style="margin-top: 8px;">
              Select an office in the toolbar if you also want to request a room for this window.
            </div>
          </div>
          <div v-if="requestType === 'individual_session'" class="nr-field" style="margin-top: 0;">
            <label class="lbl">Session modality</label>
            <div class="nr-modality-row" role="group" aria-label="Session modality">
              <button
                type="button"
                class="nr-modality"
                :class="{ on: bookingModality === 'TELEHEALTH' }"
                @click="bookingModality = 'TELEHEALTH'"
              >
                Virtual
              </button>
              <button
                type="button"
                class="nr-modality"
                :class="{ on: bookingModality === 'IN_PERSON' }"
                @click="bookingModality = 'IN_PERSON'"
              >
                In-person
              </button>
            </div>
            <div v-if="bookingModality === 'TELEHEALTH'" class="muted nr-help">
              Virtual sessions do not require an office or prior “available” hours.
            </div>
            <div v-else-if="bookingModality === 'IN_PERSON'" class="muted nr-help">
              In-person needs an office selected in the schedule toolbar.
            </div>
            <div v-else class="muted nr-help">Choose Virtual or In-person to continue.</div>

            <div v-if="bookingModality === 'TELEHEALTH'" class="nr-virtual-platform" style="margin-top: 12px;">
              <label class="sched-toggle nr-virtual-link-toggle">
                <input type="checkbox" v-model="linkPlatformVideoRoom" />
                <span>Link platform counseling video room</span>
              </label>
              <div v-if="linkPlatformVideoRoom" class="muted nr-help" style="margin-top: 6px;">
                Creates a Vonage video room on the platform. Share the join link with clients or guardians after scheduling.
              </div>

              <div v-if="linkPlatformVideoRoom" class="nr-virtual-share" style="margin-top: 12px;">
                <label class="lbl">Session join link</label>
                <div v-if="virtualSessionShareUrl" class="nr-share-row">
                  <input :value="virtualSessionShareUrl" class="input nr-share-input" type="text" readonly />
                  <button type="button" class="btn btn-secondary btn-sm" @click="copyVirtualSessionShareUrl">
                    {{ virtualSessionShareCopied ? 'Copied' : 'Copy link' }}
                  </button>
                </div>
                <p v-if="virtualSessionShareUrl" class="muted nr-help" style="margin-top: 6px;">
                  Link is active — share it with the selected client or guardians, then open the room when you are ready.
                </p>
                <p v-else class="muted nr-help" style="margin-top: 4px;">
                  The shareable link appears here after you schedule. It does not work until the session is saved.
                </p>
              </div>
            </div>

            <div v-if="bookingModality" class="nr-session-client" style="margin-top: 12px;">
              <div v-if="virtualSessionClientsLoading" class="muted" style="margin-top: 4px;">
                Loading your clients…
              </div>
              <label class="lbl" style="margin-top: 4px;">Client (required)</label>
              <div class="muted nr-help">
                Individual sessions must be attached to a client. Use Group session if multiple clients attend.
              </div>
              <label class="sched-toggle" style="margin-top: 8px;">
                <input type="checkbox" v-model="virtualSessionIncludeGuardians" />
                <span>Include guardians</span>
              </label>
              <input
                v-model="virtualSessionParticipantSearch"
                class="input"
                type="text"
                placeholder="Search clients or guardians"
                style="margin-top: 8px; margin-bottom: 8px;"
              />
              <div class="row" style="gap: 8px; flex-wrap: wrap;">
                <button class="btn btn-secondary btn-sm" type="button" @click="clearVirtualSessionParticipants">
                  Clear selection
                </button>
              </div>
              <div class="muted" style="margin-top: 6px;">
                {{ primarySessionClientLabel ? `Client: ${primarySessionClientLabel}` : 'No client selected' }}
                <span v-if="virtualSessionSelectedGuardianKeySet.size">
                  · Guardians: {{ virtualSessionSelectedGuardianKeySet.size }}
                </span>
              </div>
              <div v-if="virtualSessionParticipantChips.length" class="supervision-selected-chips" style="margin-top: 6px;">
                <button
                  v-for="chip in virtualSessionParticipantChips"
                  :key="`virtual-attendee-${chip.key}`"
                  type="button"
                  class="supervision-chip"
                  @click="removeVirtualSessionParticipant(chip)"
                >
                  <span>{{ chip.label }}</span>
                  <span aria-hidden="true">×</span>
                </button>
              </div>
              <div v-if="filteredVirtualSessionClients.length" style="margin-top: 10px;">
                <div class="muted nr-help" style="margin-bottom: 6px;">Clients</div>
                <div class="participant-scroll">
                  <div class="participant-grid">
                    <button
                      v-for="c in filteredVirtualSessionClients"
                      :key="`virtual-client-${c.id}`"
                      type="button"
                      class="participant-card"
                      :class="{ on: virtualSessionSelectedClientIdSet.has(Number(c.id)) }"
                      @click="toggleVirtualSessionClient(Number(c.id))"
                    >
                      <span class="participant-name">{{ c.displayName }}</span>
                      <span class="participant-role">{{ virtualSessionClientRoleLabel(c) }}</span>
                    </button>
                  </div>
                </div>
              </div>
              <div v-if="virtualSessionIncludeGuardians && filteredVirtualSessionGuardians.length" style="margin-top: 10px;">
                <div class="muted nr-help" style="margin-bottom: 6px;">Guardians</div>
                <div class="participant-scroll">
                  <div class="participant-grid">
                    <button
                      v-for="g in filteredVirtualSessionGuardians"
                      :key="`virtual-guardian-${g.userId}-${g.clientId}`"
                      type="button"
                      class="participant-card"
                      :class="{ on: virtualSessionSelectedGuardianKeySet.has(virtualSessionGuardianKey(g)) }"
                      @click="toggleVirtualSessionGuardian(g)"
                    >
                      <span class="participant-name">{{ g.displayName }}</span>
                      <span class="participant-role">Guardian{{ g.clientName ? ` · ${g.clientName}` : '' }}</span>
                    </button>
                  </div>
                </div>
              </div>
              <div
                v-else-if="!virtualSessionClientsLoading && !filteredVirtualSessionClients.length && (!virtualSessionIncludeGuardians || !filteredVirtualSessionGuardians.length)"
                class="muted"
                style="margin-top: 6px;"
              >
                No matching clients{{ virtualSessionIncludeGuardians ? ' or guardians' : '' }} for this agency.
              </div>
            </div>

            <label
              v-if="bookingModality === 'TELEHEALTH' && Number(selectedOfficeLocationId || 0) > 0"
              class="sched-toggle"
              style="margin-top: 8px;"
            >
              <input type="checkbox" v-model="sessionAlsoRequestOffice" />
              <span>Also request an office room for this time (optional)</span>
            </label>
          </div>

          <!-- Medical session fields: service code + location (type/subtype inferred from Individual + modality + attendees) -->
          <div
            v-if="showClinicalBookingFields && isSessionBookingRequestType"
            class="nr-field"
            style="margin-top: 12px;"
          >
            <div class="muted nr-help" style="margin-bottom: 8px;">
              {{ bookingSessionSummaryHint }}
            </div>

            <label class="lbl">Service code</label>
            <select v-model="bookingServiceCode" class="input" :disabled="bookingMetadataLoading">
              <option value="">Select service code…</option>
              <option v-for="opt in bookingServiceCodeOptions" :key="`svc-main-${opt.code}`" :value="opt.code">
                {{ opt.code }}{{ opt.label ? ` — ${opt.label}` : '' }}{{ serviceCodeOptionHints(opt) }}
              </option>
            </select>
            <div v-if="!bookingMetadataLoading && !bookingServiceCodeOptions.length" class="muted nr-help" style="margin-top: 4px;">
              No service codes available for this provider’s credential tier. Enable mental health under Booking &amp; service types, or check the provider’s credentials.
            </div>

            <label class="lbl" style="margin-top: 10px;">Service location</label>
            <select
              v-model="bookingServiceLocationId"
              class="input"
              :disabled="bookingMetadataLoading || !bookingServiceLocationOptions.length"
            >
              <option :value="0">{{ bookingServiceLocationOptions.length ? 'Select location…' : 'No locations yet…' }}</option>
              <option v-for="loc in bookingServiceLocationOptions" :key="`loc-main-${loc.id}`" :value="loc.id">
                {{ loc.name }} (POS {{ loc.placeOfService }}){{ loc.billingOfficeName ? ` · bills under ${loc.billingOfficeName}` : '' }}
              </option>
            </select>
            <div v-if="bookingUnitPreview" class="muted nr-help" style="margin-top: 6px;">{{ bookingUnitPreview }}</div>
            <div v-if="bookingMetadataLoading" class="muted" style="margin-top: 6px;">Loading service codes and locations…</div>
            <div v-else-if="bookingMetadataError" class="muted" style="margin-top: 6px;">{{ bookingMetadataError }}</div>
            <div v-if="bookingClassificationInvalidReason" class="muted" style="margin-top: 6px;">
              {{ bookingClassificationInvalidReason }}
            </div>
          </div>

          <div v-if="requestType === 'supervision' && supervisionProvidersLoading" class="muted" style="margin-top: 6px;">
            Loading providers…
          </div>
          <div v-if="requestType === 'supervision' && !supervisionProvidersLoading && availableSupervisionParticipants.length === 0" class="muted" style="margin-top: 6px;">
            No eligible supervisees are available in the selected supervision scope.
          </div>

          <div v-if="requestType === 'supervision' && availableSupervisionParticipants.length" style="margin-top: 10px;">
            <div v-if="supervisionEffectiveSessionTypeLabel" class="lbl" style="margin-bottom: 4px;">
              {{ supervisionEffectiveSessionTypeLabel }}
            </div>
            <label v-if="supervisionCanUseAllAgencies" class="sched-toggle" style="margin-top: 8px; margin-bottom: 8px;">
              <input type="checkbox" v-model="supervisionIncludeAllAgencies" />
              <span>Show group supervisees from all my agencies</span>
            </label>
            <div class="muted" style="margin-top: 6px;">
              Add participants below. Individual = 1 supervisee; triadic = 2 supervisees (billed as individual); group = 3+ supervisees (99416, different rate).
            </div>
            <label class="lbl">Primary participant</label>
            <input
              v-model="supervisionParticipantSearch"
              class="input"
              type="text"
              placeholder="Search participants by name or email"
              style="margin-bottom: 8px;"
            />
            <div class="participant-scroll">
              <div class="participant-grid">
              <button
                v-for="p in filteredSupervisionParticipants"
                :key="`supv-provider-${p.id}`"
                type="button"
                class="participant-card participant-card--rich"
                :class="{ on: Number(selectedSupervisionParticipantId || 0) === Number(p.id) }"
                @click="togglePrimarySupervisionParticipant(Number(p.id))"
              >
                <img
                  v-if="participantPhotoUrl(p)"
                  class="participant-face"
                  :src="participantPhotoUrl(p)"
                  alt=""
                />
                <span
                  v-else
                  class="participant-face participant-face--initials"
                  aria-hidden="true"
                >{{ providerInitials(p) }}</span>
                <span class="participant-copy">
                  <span class="participant-name">{{ supervisionParticipantLabel(p) }}</span>
                  <span class="participant-role">{{ String(p.role || '').trim() || 'provider' }}</span>
                </span>
              </button>
              </div>
            </div>
            <div v-if="supervisionParticipantSearch.trim() && filteredSupervisionParticipants.length === 0" class="muted" style="margin-top: 6px;">
              No participants match your search.
            </div>
            <div
              v-if="isViewingOtherUserSchedule && availableSupervisionParticipants.length > 1 && !selectedSupervisionParticipantId"
              class="muted"
              style="margin-top: 6px;"
            >
              Select who this supervision meeting is for.
            </div>

            <div style="margin-top: 8px;">
              <label class="lbl">Additional participants (optional)</label>
              <div class="muted" style="margin-top: 4px;">
                Selected: {{ supervisionSelectedParticipantCount }} (primary + additional)
              </div>
              <div v-if="selectedSupervisionParticipantChips.length" class="supervision-selected-chips" style="margin-top: 6px;">
                <button
                  v-for="chip in selectedSupervisionParticipantChips"
                  :key="`supv-chip-${chip.kind}-${chip.id}`"
                  type="button"
                  class="supervision-chip"
                  :class="{ primary: chip.kind === 'primary' }"
                  @click="removeSelectedSupervisionParticipant(chip.id, chip.kind)"
                >
                  <span>{{ chip.kind === 'primary' ? 'Primary' : 'Additional' }}: {{ supervisionParticipantLabel(chip.row || { id: chip.id }) }}</span>
                  <span aria-hidden="true">x</span>
                </button>
              </div>
              <button
                v-if="!showAdditionalParticipantsPicker"
                type="button"
                class="btn btn-secondary btn-sm"
                style="margin-top: 8px;"
                @click="showAdditionalParticipantsPicker = true"
              >
                Add additional participants
              </button>
              <div v-else style="margin-top: 8px;">
                <div class="row" style="gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">
                  <button class="btn btn-secondary btn-sm" type="button" @click="selectAllFilteredSupervisionAdditionalParticipants">
                    Add all shown
                  </button>
                  <button class="btn btn-secondary btn-sm" type="button" @click="selectAllAvailableSupervisionAdditionalParticipants">
                    Add everyone in list
                  </button>
                  <button class="btn btn-secondary btn-sm" type="button" @click="clearSupervisionAdditionalParticipants">
                    Clear additional
                  </button>
                  <button class="btn btn-ghost btn-sm" type="button" @click="showAdditionalParticipantsPicker = false">
                    Hide picker
                  </button>
                </div>
                <div class="participant-scroll">
                  <div class="participant-grid">
                    <button
                      v-for="p in filteredSupervisionAdditionalParticipants"
                      :key="`supv-extra-${p.id}`"
                      type="button"
                      class="participant-card participant-card--rich"
                      :class="{ on: selectedSupervisionAdditionalParticipantIdSet.has(Number(p.id)) }"
                      @click="toggleSupervisionAdditionalParticipant(Number(p.id))"
                    >
                      <img
                        v-if="participantPhotoUrl(p)"
                        class="participant-face"
                        :src="participantPhotoUrl(p)"
                        alt=""
                      />
                      <span
                        v-else
                        class="participant-face participant-face--initials"
                        aria-hidden="true"
                      >{{ providerInitials(p) }}</span>
                      <span class="participant-copy">
                        <span class="participant-name">{{ supervisionParticipantLabel(p) }}</span>
                        <span class="participant-role">{{ String(p.role || '').trim() || 'provider' }}</span>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
              <div
                v-if="requestType === 'supervision' && isGroupSupervisionType && supervisionSelectedParticipantCount < 3"
                class="muted"
                style="margin-top: 6px;"
              >
                Group supervision requires at least 3 participants (primary + 2 additional).
              </div>
            </div>

            <div v-if="requestType === 'supervision'" class="agenda-draft-section" style="margin-top: 12px;">
              <label class="lbl">Agenda items (optional)</label>
              <div style="display: flex; gap: 8px; margin-bottom: 6px;">
                <input
                  v-model="createAgendaDraftTitle"
                  class="input"
                  type="text"
                  placeholder="Add agenda item…"
                  @keydown.enter.prevent="addCreateAgendaDraftItem"
                />
                <button type="button" class="btn btn-secondary btn-sm" @click="addCreateAgendaDraftItem">Add</button>
              </div>
              <ul v-if="createAgendaDraftItems.length" class="agenda-draft-list">
                <li v-for="(it, idx) in createAgendaDraftItems" :key="idx">
                  {{ it.title }}
                  <button type="button" class="btn btn-ghost btn-xs" @click="removeCreateAgendaDraftItem(idx)">×</button>
                </li>
              </ul>
            </div>

            <div style="margin-top: 12px;">
              <label class="lbl">Frequency</label>
              <select v-model="supervisionRecurrence" class="input">
                <option value="ONCE">Once</option>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Biweekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
              <label
                v-if="['WEEKLY','BIWEEKLY','MONTHLY'].includes(supervisionRecurrence)"
                class="lbl"
                style="margin-top: 10px;"
              >
                Recurrence ends
              </label>
              <select
                v-if="['WEEKLY','BIWEEKLY','MONTHLY'].includes(supervisionRecurrence)"
                v-model="supervisionRecurrenceEndMode"
                class="input"
              >
                <option value="count">After number of occurrences</option>
                <option value="indefinite">Indefinite (prebuild future sessions)</option>
              </select>
              <label
                v-if="['WEEKLY','BIWEEKLY','MONTHLY'].includes(supervisionRecurrence) && supervisionRecurrenceEndMode === 'count'"
                class="lbl"
                style="margin-top: 10px;"
              >
                Occurrences
              </label>
              <input
                v-if="['WEEKLY','BIWEEKLY','MONTHLY'].includes(supervisionRecurrence) && supervisionRecurrenceEndMode === 'count'"
                v-model.number="supervisionOccurrenceCount"
                type="number"
                min="1"
                max="104"
                class="input"
                style="margin-top: 4px; width: 80px;"
              />
            </div>
          </div>

          <div
            v-if="requestType === 'agency_meeting' || requestType === 'huddle'"
            class="nr-required-panel"
            :class="{ 'input--required-missing': isMeetingParticipantsMissing }"
            style="margin-top: 10px;"
          >
            <div v-if="meetingCandidatesLoading" class="muted" style="margin-top: 6px;">
              Loading agency coworkers…
            </div>
            <div v-else-if="!availableMeetingCandidates.length" class="muted" style="margin-top: 6px;">
              No coworkers are available in this scope.
            </div>
            <label v-if="meetingCanUseAllAgencies" class="sched-toggle" style="margin-top: 8px; margin-bottom: 8px;">
              <input type="checkbox" v-model="meetingIncludeAllAgencies" />
              <span>Include coworkers from all my agencies</span>
            </label>
            <label class="lbl" :class="{ 'lbl--required-missing': isMeetingParticipantsMissing }">
              Coworkers (agency staff) <span aria-hidden="true">*</span>
            </label>
            <div v-if="isMeetingParticipantsMissing" class="nr-required-hint">Select at least one coworker to invite.</div>
            <input
              v-model="meetingParticipantSearch"
              class="input"
              type="text"
              placeholder="Search coworkers by name or email"
              style="margin-bottom: 8px;"
            />
            <div class="row" style="gap: 8px; margin-top: 6px; flex-wrap: wrap;">
              <button class="btn btn-secondary btn-sm" type="button" @click="selectAllFilteredMeetingParticipants">
                Add all shown
              </button>
              <button class="btn btn-secondary btn-sm" type="button" @click="selectAllAvailableMeetingParticipants">
                Add everyone in list
              </button>
              <button class="btn btn-secondary btn-sm" type="button" @click="clearMeetingParticipants">
                Clear coworkers
              </button>
            </div>
            <div class="muted" style="margin-top: 6px;">
              Selected coworkers: {{ selectedMeetingParticipantIdSet.size }}
            </div>
            <div v-if="selectedMeetingParticipantChips.length" class="supervision-selected-chips">
              <button
                v-for="chip in selectedMeetingParticipantChips"
                :key="`meeting-chip-${chip.id}`"
                type="button"
                class="supervision-chip"
                @click="removeSelectedMeetingParticipant(chip.id)"
              >
                <span>{{ supervisionParticipantLabel(chip.row || { id: chip.id }) }}</span>
                <span aria-hidden="true">x</span>
              </button>
            </div>
            <div class="participant-scroll" style="margin-top: 6px;">
              <div class="participant-grid">
                <button
                  v-for="p in filteredMeetingCandidates"
                  :key="`meeting-participant-${p.id}`"
                  type="button"
                  class="participant-card participant-card--rich"
                  :class="{ on: selectedMeetingParticipantIdSet.has(Number(p.id)) }"
                  @click="toggleMeetingParticipant(Number(p.id))"
                >
                  <img
                    v-if="participantPhotoUrl(p)"
                    class="participant-face"
                    :src="participantPhotoUrl(p)"
                    alt=""
                  />
                  <span
                    v-else
                    class="participant-face participant-face--initials"
                    aria-hidden="true"
                  >{{ providerInitials(p) }}</span>
                  <span class="participant-copy">
                    <span class="participant-name">{{ supervisionParticipantLabel(p) }}</span>
                    <span class="participant-role">
                      {{ String(p.role || '').trim() || 'provider' }} • {{ meetingParticipantBusyText(p.id) }}
                    </span>
                  </span>
                </button>
              </div>
            </div>
            <div class="muted" style="margin-top: 6px;">
              Busy participants can still be invited, but they are marked above before booking.
            </div>
            <label v-if="scheduleVideoConfigured" class="sched-toggle" style="margin-top: 8px;">
              <input type="checkbox" v-model="linkMeetingPlatformVideo" />
              <span>Link platform video room</span>
            </label>
            <div v-if="scheduleVideoConfigured && linkMeetingPlatformVideo" class="muted nr-help" style="margin-top: 6px;">
              Creates an in-app video room for this meeting. The join link is added to the calendar invite.
            </div>
            <label v-if="!scheduleVideoConfigured || !linkMeetingPlatformVideo" class="sched-toggle" style="margin-top: 8px;">
              <input type="checkbox" v-model="createMeetingMeetLink" />
              <span>Create Google Meet link</span>
            </label>
            <div v-if="requestType === 'agency_meeting' || requestType === 'huddle'" class="agenda-draft-section" style="margin-top: 12px;">
              <label class="lbl">Agenda items (optional)</label>
              <div style="display: flex; gap: 8px; margin-bottom: 6px;">
                <input
                  v-model="createAgendaDraftTitle"
                  class="input"
                  type="text"
                  placeholder="Add agenda item…"
                  @keydown.enter.prevent="addCreateAgendaDraftItem"
                />
                <button type="button" class="btn btn-secondary btn-sm" @click="addCreateAgendaDraftItem">Add</button>
              </div>
              <ul v-if="createAgendaDraftItems.length" class="agenda-draft-list">
                <li v-for="(it, idx) in createAgendaDraftItems" :key="idx">
                  {{ it.title }}
                  <button type="button" class="btn btn-ghost btn-xs" @click="removeCreateAgendaDraftItem(idx)">×</button>
                </li>
              </ul>
            </div>
          </div>

          <div
            v-if="showSessionOfficeBookingPanel"
            style="margin-top: 10px;"
          >
            <div v-if="!selectedOfficeLocationId" class="muted">
              Select an office from the toolbar above to view open/assigned/booked time and place a booking request.
            </div>
            <template v-else>
              <div v-if="requestType === 'office_request_only'" class="modern-help">
                Request permission to use office space. Staff will assign you when available. Use the End time dropdown to select multiple hours.
              </div>
              <div v-if="requestType === 'office_request_only'" class="muted" style="margin-top: 8px;">
                <div><strong>Building:</strong> {{ officeRequestSummary.building }}</div>
                <div><strong>Room:</strong> {{ officeRequestSummary.room }}</div>
                <div><strong>Time:</strong> {{ officeRequestSummary.timeRange }}</div>
                <div><strong>Duration:</strong> {{ officeRequestSummary.duration }}</div>
              </div>

              <!-- Booking helper copy for the direct 'office' booking action -->
              <div v-if="requestType === 'office'" class="book-slot-help">
                <strong>Book this assigned office slot.</strong>
                Choose <em>Once</em> to mark just this occurrence as booked, or select a recurring frequency to book the next several sessions automatically.
              </div>

              <label class="lbl" :style="requestType === 'office' ? 'margin-top: 10px;' : ''">
                {{ requestType === 'office' ? 'How often?' : 'Frequency' }}
              </label>
              <select v-model="officeBookingRecurrence" class="input" :disabled="requestType === 'office' && modalIsOneTimeAssignedSlot">
                <option value="ONCE">Once (this occurrence only)</option>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Biweekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>

              <label v-if="['WEEKLY','BIWEEKLY','MONTHLY'].includes(officeBookingRecurrence)" class="lbl" style="margin-top: 10px;">
                Number of sessions
              </label>
              <input
                v-if="['WEEKLY','BIWEEKLY','MONTHLY'].includes(officeBookingRecurrence)"
                v-model.number="officeBookingOccurrenceCount"
                type="number"
                min="1"
                :max="officeBookingRecurrence === 'WEEKLY' ? 26 : 104"
                class="input"
                style="margin-top: 4px; width: 80px;"
              />
              <div v-if="['WEEKLY','BIWEEKLY','MONTHLY'].includes(officeBookingRecurrence)" class="muted" style="margin-top: 4px; font-size: 12px;">
                Default is 6 sessions. You can change this.
              </div>

              <label v-if="viewMode === 'office_layout'" class="lbl" style="margin-top: 10px;">Room</label>
              <div v-if="viewMode === 'office_layout' && officeGridLoading" class="muted">Loading rooms…</div>
              <div v-else-if="viewMode === 'office_layout' && officeGridError" class="error">{{ officeGridError }}</div>
              <div v-else-if="viewMode === 'office_layout' && requestType === 'office' && modalLockRoomToAssigned" class="muted">
                Assigned room is locked for this slot: <strong>{{ modalLockedRoomLabel }}</strong>.
              </div>
              <div v-else-if="viewMode === 'office_layout' && (requestType === 'office' || requestType === 'individual_session' || requestType === 'group_session')" class="office-room-picker">
                <label class="office-room-option">
                  <input type="radio" name="office-room" :value="0" v-model.number="selectedOfficeRoomId" />
                  <span class="office-room-label">Any open room</span>
                </label>
                <label
                  v-for="opt in modalOfficeRoomOptions"
                  :key="`room-opt-${opt.roomId}`"
                  class="office-room-option"
                  :class="{ disabled: !opt.requestable }"
                >
                  <input type="radio" name="office-room" :value="opt.roomId" v-model.number="selectedOfficeRoomId" :disabled="!opt.requestable" />
                  <span class="office-room-label">{{ opt.label }}</span>
                  <span class="office-room-meta">{{ opt.stateLabel }}</span>
                </label>
              </div>
              <div v-else-if="viewMode === 'office_layout'" class="muted">Separate office request mode does not require room selection.</div>
              <div
                v-else-if="(requestType === 'office' || requestType === 'group_session' || (requestType === 'individual_session' && bookingModality === 'IN_PERSON')) && viewMode === 'open_finder'"
                class="muted"
              >
                Any open room will be used. Switch to Office layout for specific room selection.
              </div>
              <div v-if="officeBookingHint" class="muted" style="margin-top: 6px;">{{ officeBookingHint }}</div>
            </template>
          </div>

          <div v-if="requestType === 'forfeit_slot'" style="margin-top: 10px;">
            <label class="lbl">Forfeit scope</label>
            <select v-model="forfeitScope" class="input" style="margin-bottom: 8px;">
              <option value="occurrence">Forfeit this occurrence only</option>
              <option value="future" :disabled="!hasFutureForfeitSupport">Forfeit this and all future recurring</option>
            </select>
            <label class="sched-toggle" style="display: flex; align-items: flex-start; gap: 8px; margin-top: 8px;">
              <input type="checkbox" v-model="ackForfeit" />
              <span>I understand this slot's day/time/frequency is forfeit at this time and available to others.</span>
            </label>
          </div>

          <div
            v-if="requestType === 'intake_virtual_on' || requestType === 'intake_virtual_off' || requestType === 'intake_inperson_on' || requestType === 'intake_inperson_off'"
            class="modern-help"
            style="margin-top: 10px;"
          >
            {{ intakeActionHelpText }}
          </div>

          <div v-if="intakeConfirmStep === 'ask_inperson'" class="intake-confirm" style="margin-top: 12px; padding: 12px; background: var(--surface-2); border-radius: 8px;">
            <div class="lbl" style="margin-bottom: 8px;">Set as available for virtual intake also?</div>
            <div style="display: flex; gap: 8px;">
              <button type="button" class="btn btn-primary" @click="confirmIntakeInPerson(true)">Yes, both</button>
              <button type="button" class="btn btn-secondary" @click="confirmIntakeInPerson(false)">In-person only</button>
              <button type="button" class="btn btn-secondary" @click="intakeConfirmStep = null">Cancel</button>
            </div>
          </div>
          <div v-else-if="intakeConfirmStep === 'ask_virtual'" class="intake-confirm" style="margin-top: 12px; padding: 12px; background: var(--surface-2); border-radius: 8px;">
            <div class="lbl" style="margin-bottom: 8px;">Virtual intake only – are you sure?</div>
            <div style="display: flex; gap: 8px;">
              <button type="button" class="btn btn-primary" @click="confirmIntakeVirtual()">Yes</button>
              <button type="button" class="btn btn-secondary" @click="intakeConfirmStep = null">Cancel</button>
            </div>
          </div>

          <div v-if="isScheduleEventRequestType" style="margin-top: 10px;">
            <div class="modern-help">
              Creates a calendar event for this provider. It appears in Google titles when enabled.
            </div>

            <label class="lbl" :class="{ 'lbl--required-missing': isScheduleEventTitleMissing }" style="margin-top: 10px;">
              Event title <span aria-hidden="true">*</span>
            </label>
            <input
              v-model="scheduleEventTitle"
              class="input"
              :class="{ 'input--required-missing': isScheduleEventTitleMissing }"
              type="text"
              :placeholder="scheduleEventTitlePlaceholder"
              maxlength="200"
            />
            <div v-if="isScheduleEventTitleMissing" class="nr-required-hint">Title is required before you can schedule.</div>

            <div v-if="showScheduleEventOrgPicker" style="margin-top: 10px;">
              <label class="lbl">Organization</label>
              <select v-model.number="scheduleEventAgencyScope" class="input">
                <option :value="0">{{ scheduleEventOrgNoneLabel }}</option>
                <option
                  v-for="opt in scheduleEventOrgOptions"
                  :key="`sched-evt-org-${opt.id}`"
                  :value="Number(opt.id)"
                >
                  {{ opt.label }}
                </option>
              </select>
              <div class="muted nr-help" style="margin-top: 4px;">
                {{ scheduleEventOrgHelpText }}
              </div>
            </div>

            <div v-if="requestType === 'schedule_hold' || requestType === 'schedule_hold_all_day'" style="margin-top: 10px;">
              <label class="lbl">Hold reason</label>
              <select v-model="scheduleHoldReasonCode" class="input">
                <option v-for="opt in scheduleHoldReasonOptions" :key="`hold-reason-${opt.code}`" :value="opt.code">
                  {{ opt.label }}
                </option>
              </select>
              <input
                v-if="scheduleHoldReasonCode === 'CUSTOM'"
                v-model="scheduleHoldCustomReason"
                class="input"
                type="text"
                placeholder="Custom hold reason"
                maxlength="120"
                style="margin-top: 8px;"
              />
            </div>

            <label class="sched-toggle" style="margin-top: 10px;">
              <input type="checkbox" v-model="scheduleEventAllDay" />
              <span>All day</span>
            </label>
            <label class="sched-toggle" style="margin-top: 6px;">
              <input type="checkbox" v-model="scheduleEventPrivate" />
              <span>Private (others only see Busy)</span>
            </label>

            <div v-if="requestType === 'agency_meeting' || requestType === 'huddle'" style="margin-top: 10px;">
              <label class="lbl">Frequency</label>
              <select v-model="scheduleEventRecurrence" class="input">
                <option value="ONCE">Once</option>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Biweekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
              <label
                v-if="['WEEKLY','BIWEEKLY','MONTHLY'].includes(scheduleEventRecurrence)"
                class="lbl"
                style="margin-top: 10px;"
              >
                Recurrence ends
              </label>
              <select
                v-if="['WEEKLY','BIWEEKLY','MONTHLY'].includes(scheduleEventRecurrence)"
                v-model="scheduleEventRecurrenceEndMode"
                class="input"
              >
                <option value="count">After number of occurrences</option>
                <option value="indefinite">Indefinite (prebuild future meetings)</option>
              </select>
              <label
                v-if="['WEEKLY','BIWEEKLY','MONTHLY'].includes(scheduleEventRecurrence) && scheduleEventRecurrenceEndMode === 'count'"
                class="lbl"
                style="margin-top: 10px;"
              >
                Occurrences
              </label>
              <input
                v-if="['WEEKLY','BIWEEKLY','MONTHLY'].includes(scheduleEventRecurrence) && scheduleEventRecurrenceEndMode === 'count'"
                v-model.number="scheduleEventOccurrenceCount"
                type="number"
                min="1"
                max="104"
                class="input"
                style="margin-top: 4px; width: 80px;"
              />
              <div
                v-if="['WEEKLY','BIWEEKLY','MONTHLY'].includes(scheduleEventRecurrence) && scheduleEventRecurrenceEndMode === 'indefinite'"
                class="muted"
                style="margin-top: 6px;"
              >
                Indefinite creates a long-running future series and supports deleting this occurrence or all future.
              </div>
            </div>
          </div>

          <div v-if="canUseQuarterHourInput && !disableEndTimeInput && requestType !== 'admin_assign' && requestType !== 'cancel_booking'" class="row" style="gap: 8px; margin-top: 10px; margin-bottom: 10px;">
            <label class="sched-inline compact" style="flex: 1;">
              <span>Start time</span>
              <select v-model.number="modalStartHour" class="sched-select compact">
                <option v-for="h in startHourOptions" :key="`start-${h}`" :value="h">
                  {{ hourLabel(h) }}
                </option>
              </select>
            </label>
            <label class="sched-inline compact" style="flex: 1;">
              <span>Start min</span>
              <select v-model.number="modalStartMinute" class="sched-select compact">
                <option v-for="m in quarterMinuteOptions" :key="`start-min-${m}`" :value="m">
                  :{{ String(m).padStart(2, '0') }}
                </option>
              </select>
            </label>
          </div>

          <template v-if="requestType !== 'admin_assign' && requestType !== 'cancel_booking'">
            <div class="nr-field">
              <label class="lbl">End time</label>
              <div class="nr-input-wrap">
                <span class="nr-input-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7">
                    <circle cx="12" cy="12" r="8"/>
                    <path d="M12 8v5l3 2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
                <select
                  v-model.number="modalEndHour"
                  class="input nr-input"
                  :disabled="disableEndTimeInput"
                >
                  <option v-for="h in endHourOptions" :key="`end-${h}`" :value="h">
                    {{ hourLabel(h) }}
                  </option>
                </select>
              </div>
              <div class="muted nr-help">When this should end.</div>
            </div>

            <div v-if="canUseQuarterHourInput && !disableEndTimeInput" class="row" style="gap: 8px; margin-top: 8px;">
              <label class="sched-inline compact" style="flex: 1;">
                <span>End min</span>
                <select v-model.number="modalEndMinute" class="sched-select compact">
                  <option v-for="m in endMinuteOptions" :key="`end-min-${m}`" :value="m">
                    :{{ String(m).padStart(2, '0') }}
                  </option>
                </select>
              </label>
            </div>

            <div class="nr-field">
              <label class="lbl">Notes (optional)</label>
              <div class="nr-notes-wrap">
                <textarea
                  v-model="requestNotes"
                  class="input nr-notes"
                  rows="3"
                  maxlength="500"
                  :placeholder="requestNotesPlaceholder"
                />
                <span class="nr-notes-count">{{ requestNotesCount }}/{{ REQUEST_NOTES_MAX }}</span>
              </div>
            </div>

            <div class="nr-summary">
              <div class="nr-summary-title">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                  <rect x="6" y="3" width="12" height="18" rx="2"/>
                  <path d="M9 8h6M9 12h6M9 16h4" stroke-linecap="round"/>
                </svg>
                Summary
              </div>
              <dl class="nr-summary-grid">
                <div><dt>Type</dt><dd>{{ virtualSessionSummaryTypeLabel }}</dd></div>
                <div v-if="isVirtualTelehealthSession && linkPlatformVideoRoom"><dt>Video</dt><dd>Platform counseling room</dd></div>
                <div v-if="primarySessionClientLabel"><dt>Client</dt><dd>{{ primarySessionClientLabel }}</dd></div>
                <div v-else-if="requestType === 'individual_session'"><dt>Client</dt><dd>—</dd></div>
                <div><dt>Organization</dt><dd>{{ requestSummaryOrganizationLabel }}</dd></div>
                <div><dt>End time</dt><dd>{{ requestSummaryEndTimeLabel }}</dd></div>
                <div><dt>Notes</dt><dd>{{ requestNotes.trim() ? requestNotes.trim() : '—' }}</dd></div>
              </dl>
            </div>

            <div v-if="modalError" class="error" style="margin-top: 10px;">{{ modalError }}</div>
            <div v-else-if="requestSubmitBlockedReason && requestType" class="nr-blocked-reason">
              {{ requestSubmitBlockedReason }}
            </div>
          </template>

          <!-- Cancel booking form (admin only) -->
          <div v-if="requestType === 'cancel_booking'" class="cb-form">
            <div class="cb-info">
              <strong>Cancel this booking</strong>
              <span v-if="modalContext.bookedProviderName || modalContext.assignedProviderName">
                — {{ modalContext.bookedProviderName || modalContext.assignedProviderName }}
              </span>
            </div>
            <div class="cb-scope-row">
              <label class="check">
                <input type="radio" v-model="cancelBookingScope" value="occurrence" />
                <span><strong>This occurrence only</strong> — cancel just this date's booking, keep the recurring assignment</span>
              </label>
              <label class="check">
                <input type="radio" v-model="cancelBookingScope" value="future" />
                <span><strong>This and all future</strong> — cancel this date and deactivate all upcoming recurrences</span>
              </label>
            </div>
            <div v-if="cancelBookingError" class="error" style="margin-top: 8px;">{{ cancelBookingError }}</div>
            <button
              class="btn btn-danger"
              type="button"
              :disabled="cancelBookingLoading"
              style="margin-top: 12px; width: 100%;"
              @click="submitCancelBooking"
            >{{ cancelBookingLoading ? 'Cancelling…' : (cancelBookingScope === 'future' ? 'Cancel this & all future occurrences' : 'Cancel this occurrence') }}</button>
          </div>

          <!-- Admin assign form (shown instead of standard end-time/notes/submit) -->
          <div v-if="requestType === 'admin_assign'" class="aa-form">
            <!-- Room context info -->
            <div v-if="modalContext.roomId" class="aa-room-info">
              <span class="aa-room-label">Room:</span>
              <span>{{ adminAssignRoomLabel }}</span>
            </div>
            <div v-else class="modern-help" style="margin-top: 8px;">
              Switch to office layout view and click a specific room cell to assign directly. Make sure an office location is selected in the toolbar.
            </div>

            <!-- Mode: person vs company hold -->
            <div class="aa-mode-block">
              <div class="lbl">Assignment type</div>
              <div class="aa-mode-row" role="radiogroup" aria-label="Assignment type">
                <button
                  type="button"
                  class="aa-mode-card"
                  :class="{ on: adminAssignMode === 'provider' }"
                  role="radio"
                  :aria-checked="adminAssignMode === 'provider'"
                  @click="adminAssignMode = 'provider'"
                >
                  <span class="aa-mode-card-title">Assign to person</span>
                  <span class="aa-mode-card-desc">Give this slot to a provider</span>
                </button>
                <button
                  type="button"
                  class="aa-mode-card"
                  :class="{ on: adminAssignMode === 'company_hold' }"
                  role="radio"
                  :aria-checked="adminAssignMode === 'company_hold'"
                  @click="adminAssignMode = 'company_hold'"
                >
                  <span class="aa-mode-card-title">Company hold</span>
                  <span class="aa-mode-card-desc">Block the room for the company</span>
                </button>
              </div>
            </div>

            <!-- Company hold label -->
            <div v-if="adminAssignMode === 'company_hold'" class="aa-field">
              <label class="lbl">Hold label</label>
              <input v-model="adminAssignHoldTitle" class="input aa-input" type="text" maxlength="255" placeholder="Company hold" />
            </div>

            <!-- Person search -->
            <div v-else class="aa-field aa-person-field">
              <label class="lbl">
                Person
                <span v-if="adminAssignProvidersLoading" class="muted" style="font-weight:400;"> (loading…)</span>
              </label>
              <div class="aa-person-search-wrap">
                <input
                  v-model="adminAssignPersonSearch"
                  class="input aa-input"
                  :class="{ 'aa-has-selection': adminAssignPersonId }"
                  type="text"
                  autocomplete="off"
                  placeholder="Search by name…"
                  @focus="adminAssignShowDropdown = true"
                  @blur="onAdminAssignPersonBlur"
                />
                <div v-if="adminAssignShowDropdown && adminAssignPersonResults.length" class="aa-person-dropdown" @mousedown.prevent>
                  <button
                    v-for="p in adminAssignPersonResults"
                    :key="`aa-p-${p.id}`"
                    type="button"
                    class="aa-person-option"
                    :class="{ 'aa-person-option--selected': Number(p.id) === adminAssignPersonId }"
                    @click="selectAdminAssignPerson(p)"
                  >
                    <span>{{ p.last_name }}, {{ p.first_name }}</span>
                    <span class="aa-role-badge">{{ p.role }}</span>
                  </button>
                </div>
              </div>
              <div v-if="adminAssignPersonId" class="aa-selected-person">
                <span class="aa-selected-person-name">✓ {{ adminAssignPersonName }}</span>
                <button type="button" class="aa-clear-person" title="Clear selection" @click="adminAssignPersonId = 0; adminAssignPersonName = ''; adminAssignPersonSearch = ''">Clear</button>
              </div>
              <div v-if="!adminAssignProvidersLoading && !adminAssignProviders.length && selectedOfficeLocationId" class="muted" style="margin-top: 4px; font-size: 12px;">
                No providers found for this office location.
              </div>
            </div>

            <!-- Start / end time (editable after drag-select) -->
            <div class="aa-field aa-time-row">
              <div>
                <label class="lbl">Start time</label>
                <select
                  v-model.number="officeAssignStartHour"
                  class="input aa-input"
                  @change="onOfficeAssignStartHourChange"
                >
                  <option v-for="h in officeAssignStartHourOptions" :key="`aa-start-${h}`" :value="h">{{ hourLabel(h) }}</option>
                </select>
              </div>
              <div>
                <label class="lbl">End time</label>
                <select
                  v-model.number="officeAssignEndHour"
                  class="input aa-input"
                  @change="syncOfficeAssignTimesToModal"
                >
                  <option v-for="h in officeAssignEndHourOptions" :key="`aa-end-${h}`" :value="h">{{ hourLabel(h) }}</option>
                </select>
              </div>
            </div>

            <!-- Recurrence -->
            <div class="aa-field">
              <label class="lbl">Recurrence</label>
              <select v-model="adminAssignRecurrence" class="input aa-input">
                <option value="ONCE">Single occurrence</option>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Biweekly</option>
              </select>
            </div>

            <!-- Recurring options -->
            <template v-if="adminAssignRecurrence !== 'ONCE'">
              <div style="margin-top: 8px;">
                <label class="lbl">Days</label>
                <div class="aa-weekday-row">
                  <label
                    v-for="wd in ADMIN_ASSIGN_WEEKDAYS"
                    :key="`aa-wd-${wd.value}`"
                    class="aa-weekday-check"
                    :class="{ on: adminAssignWeekdays.includes(wd.value) }"
                  >
                    <input
                      type="checkbox"
                      :checked="adminAssignWeekdays.includes(wd.value)"
                      @change="adminAssignWeekdays.includes(wd.value)
                        ? adminAssignWeekdays.splice(adminAssignWeekdays.indexOf(wd.value), 1)
                        : adminAssignWeekdays.push(wd.value)"
                      style="display:none;"
                    />
                    {{ wd.label }}
                  </label>
                </div>
              </div>
              <div style="margin-top: 8px;">
                <label class="lbl">Recurring until</label>
                <input v-model="adminAssignRecurringUntil" type="date" class="input" />
              </div>
              <div v-if="adminAssignMode === 'provider'" class="aa-field">
                <label class="check aa-temp-check">
                  <input type="checkbox" v-model="adminAssignTemporary4Weeks" />
                  <span>Temporary 4-week hold</span>
                </label>
                <div v-if="adminAssignTemporary4Weeks" class="muted" style="font-size: 12px; margin-top: 4px;">
                  Temporary while placing a client. Converts to a regular assignment when booked.
                </div>
              </div>
            </template>

            <div v-if="adminAssignError" class="error" style="margin-top: 8px;">{{ adminAssignError }}</div>
            <div style="margin-top: 12px; display: flex; justify-content: flex-end;">
              <button
                class="btn btn-primary"
                type="button"
                :disabled="adminAssignLoading || !adminAssignCanSubmit"
                @click="submitAdminAssign"
              >
                {{ adminAssignLoading ? 'Assigning…' : (adminAssignMode === 'company_hold' ? 'Block slot' : 'Assign') }}
              </button>
            </div>
          </div>

          </div><!-- /.nr-main -->
        </div><!-- /.nr-layout -->

        <div
          v-if="isScheduleEventEditMode && editingScheduleStackItem"
          class="nr-footer"
        >
          <button class="btn btn-secondary nr-btn-cancel" type="button" :disabled="scheduleEventSaving" @click="requestCloseModal">
            Cancel
          </button>
          <button
            class="btn nr-btn-submit"
            type="button"
            :disabled="scheduleEventSaving"
            @click="saveScheduleStackItem(editingScheduleStackItem)"
          >
            {{ scheduleEventSaving ? 'Saving…' : 'Save changes' }}
          </button>
        </div>
        <div
          v-else-if="isSupervisionEditMode"
          class="nr-footer"
        >
          <button
            class="btn btn-danger"
            type="button"
            :disabled="supvSaving || !selectedSupvSessionId"
            @click="cancelSupvSession"
          >
            Cancel session
          </button>
          <button
            class="btn nr-btn-submit"
            type="button"
            :disabled="supvSaving || !selectedSupvSessionId"
            @click="saveSupvSessionFromScheduleModal"
          >
            {{ supvSaving ? 'Saving…' : 'Save changes' }}
          </button>
        </div>
        <div v-else-if="!showActionChooser && !isAppointmentEditMode && !intakeConfirmStep && requestType !== 'admin_assign' && requestType !== 'cancel_booking' && requestType !== 'slot_details'" class="nr-footer">
          <button class="btn btn-secondary nr-btn-cancel" type="button" @click="requestCloseModal">
            {{ virtualSessionShareUrl && isVirtualTelehealthSession ? 'Done' : 'Cancel' }}
          </button>
          <button
            class="btn nr-btn-submit"
            type="button"
            @click="submitRequest"
            :disabled="requestSubmitDisabled"
            :title="requestSubmitBlockedReason || submitActionLabel"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M4 12l15-8-4 16-4-6-7-2z" stroke-linejoin="round"/>
            </svg>
            {{ submitting ? submitBusyLabel : submitActionLabel }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showSupvModal" class="modal-backdrop modal-backdrop--request" @click.self="closeSupvModal">
      <div class="modal modal--new-request modal--stack-details" style="max-width: 680px;">
        <div class="nr-head">
          <div class="nr-head-main">
            <span class="nr-head-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8">
                <circle cx="12" cy="8" r="3.2"/>
                <path d="M5 19c1-3.5 3.4-5.2 7-5.2S18 15.5 19 19"/>
              </svg>
            </span>
            <div class="nr-head-copy">
              <div class="nr-title">Supervision session</div>
              <div class="nr-subtitle">{{ supvDisplayDayLabel }} • {{ hourLabel(supvStartHour) }}–{{ hourLabel(supvEndHour) }}</div>
            </div>
          </div>
          <div class="nr-head-context">
            <button class="nr-close" type="button" aria-label="Close" @click="closeSupvModal">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M6 6l12 12M18 6L6 18"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="nr-chooser stack-details-body">
          <div v-if="supvModalError" class="error" style="margin-bottom: 10px;">{{ supvModalError }}</div>

          <div class="stack-details-static nr-appt-edit">
            <div class="stack-details-kind">Supervision</div>
            <div class="stack-details-label">{{ selectedSupvSession?.counterpartyName || 'Session details' }}</div>
            <div class="stack-details-sub">{{ supvDisplayDayLabel }} • {{ hourLabel(supvStartHour) }}–{{ hourLabel(supvEndHour) }}</div>

          <div v-if="supvOptions.length > 1" style="margin: 12px 0 0;">
            <label class="lbl">Session</label>
            <select v-model.number="selectedSupvSessionId" class="input nr-appt-input">
              <option v-for="o in supvOptions" :key="`supv-opt-${o.id}`" :value="o.id">
                {{ o.label }}
              </option>
            </select>
          </div>

          <div class="nr-info-bar nr-info-bar--edit" style="margin-top: 12px;">
            <div class="nr-info-cell">
              <span class="nr-info-label">When</span>
              <div class="nr-when-edit nr-when-edit--stack">
                <input v-model="supvStartIsoLocal" class="nr-info-select" type="datetime-local" />
                <span class="nr-when-sep">–</span>
                <input v-model="supvEndIsoLocal" class="nr-info-select" type="datetime-local" />
              </div>
              <span v-if="bookingTimezoneLabel" class="nr-tz-under">{{ bookingTimezoneLabel }}</span>
            </div>
            <div class="nr-info-cell">
              <span class="nr-info-label">Participant</span>
              <span class="nr-info-value">{{ selectedSupvSession?.counterpartyName || '—' }}</span>
            </div>
            <div class="nr-info-cell">
              <span class="nr-info-label">Status</span>
              <span class="nr-info-value">Scheduled</span>
            </div>
          </div>

          <div style="margin-top: 12px;">
            <label class="lbl">Notes</label>
            <textarea v-model="supvNotes" class="input nr-appt-input" rows="4" placeholder="Optional notes for the Google Calendar description…" />
          </div>

          <div v-if="selectedSupvSession?.joinUrl || selectedSupvSession?.googleMeetLink" class="muted" style="margin-top: 8px;">
            <div v-if="selectedSupvSession?.googleMeetLink">Meet link:</div>
            <a v-if="selectedSupvSession?.googleMeetLink" :href="selectedSupvSession.googleMeetLink" target="_blank" rel="noreferrer">
              {{ selectedSupvSession.googleMeetLink }}
            </a>
            <div style="margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap;">
              <button
                class="btn btn-primary btn-sm"
                type="button"
                :disabled="supvMeetOpening || supvAppVideoLoading"
                @click="startTrackedSupvMeet"
              >
                {{ (supvMeetOpening || supvAppVideoLoading) ? 'Joining…' : (selectedSupvSession?.joinUrl ? 'Join with app' : 'Join Meet (tracked)') }}
              </button>
              <a
                v-if="selectedSupvSession?.joinUrl || selectedSupvSession?.googleMeetLink"
                class="btn btn-secondary btn-sm"
                :href="selectedSupvSession?.joinUrl || selectedSupvSession?.googleMeetLink"
                target="_blank"
                rel="noreferrer"
              >
                Open in new tab
              </a>
            </div>
            <div class="muted" style="margin-top: 6px; font-size: 12px;">
              {{ selectedSupvSession?.joinUrl ? 'Join via in-app video.' : 'Starts in-app tracking for opened/closed meeting activity.' }}
            </div>
          </div>
          <div v-else class="muted" style="margin-top: 8px;">
            No video link yet. Join link appears when video is configured.
          </div>

          <div style="margin-top: 12px;">
            <button
              class="btn btn-secondary btn-sm"
              type="button"
              :disabled="!selectedSupvSessionId"
              @click="showAgendaPanel = true"
            >
              Agenda
            </button>
          </div>

          <div style="margin-top: 10px; border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 10px; background: #fafafa;">
            <label class="lbl">Transcript link</label>
            <input v-model="supvTranscriptUrl" class="input" type="url" placeholder="https://... transcript link" />
            <label class="lbl" style="margin-top: 8px;">Transcript text</label>
            <textarea
              v-model="supvTranscriptText"
              class="input"
              rows="4"
              placeholder="Paste transcript text so Gemini can generate a summary."
            />
            <label class="lbl" style="margin-top: 8px;">Summary</label>
            <textarea
              v-model="supvSummaryText"
              class="input"
              rows="4"
              placeholder="Session summary"
            />
            <div class="modal-actions" style="margin-top: 8px; justify-content: flex-start;">
              <button
                class="btn btn-secondary btn-sm"
                type="button"
                :disabled="supvArtifactSaving || supvArtifactLoading || !selectedSupvSessionId"
                @click="saveSupvArtifact({ autoSummarize: false })"
              >
                {{ supvArtifactSaving ? 'Saving…' : 'Save transcript + summary' }}
              </button>
              <button
                class="btn btn-primary btn-sm"
                type="button"
                :disabled="supvArtifactSaving || supvArtifactLoading || !selectedSupvSessionId || !supvTranscriptText.trim()"
                @click="saveSupvArtifact({ autoSummarize: true })"
              >
                Generate summary with Gemini
              </button>
              <a
                v-if="supvTranscriptUrl"
                class="btn btn-secondary btn-sm"
                :href="supvTranscriptUrl"
                target="_blank"
                rel="noreferrer"
              >
                Open transcript
              </a>
            </div>
            <div v-if="supvArtifactLoading" class="muted" style="margin-top: 6px;">Loading transcript/summary...</div>
            <div v-if="supvArtifactError" class="error" style="margin-top: 6px;">{{ supvArtifactError }}</div>
          </div>

          <div style="margin-top: 12px;">
            <label class="lbl">Presenter tracking</label>
            <div v-if="supvPresentersLoading" class="muted">Loading presenters…</div>
            <div v-else-if="supvPresentersError" class="error">{{ supvPresentersError }}</div>
            <div v-else-if="supvPresenters.length === 0" class="muted">No presenters assigned.</div>
            <div v-else class="supv-presenter-list">
              <div v-for="p in supvPresenters" :key="`presenter-${p.id}`" class="supv-presenter-row">
                <div>
                  <strong>{{ p.presenter_name || p.presenter_email || `User ${p.user_id}` }}</strong>
                  <span class="muted"> ({{ p.presenter_role === 'secondary' ? 'Secondary' : 'Primary' }})</span>
                  <span class="muted"> · {{ String(p.status || 'assigned') }}</span>
                </div>
                <button
                  v-if="canManagePresenterStatus"
                  class="btn btn-secondary btn-sm"
                  type="button"
                  :disabled="supvSaving"
                  @click="togglePresenterPresented(p)"
                >
                  {{ String(p.status || '').toLowerCase() === 'presented' ? 'Mark unpresented' : 'Mark presented' }}
                </button>
              </div>
            </div>
          </div>

          <div class="modal-actions" style="margin-top: 14px; justify-content: space-between;">
            <button class="btn btn-danger" type="button" @click="cancelSupvSession" :disabled="supvSaving || !selectedSupvSessionId">
              Cancel session
            </button>
            <button class="btn btn-primary btn-sm stack-details-edit-btn" type="button" @click="saveSupvSession" :disabled="supvSaving || !selectedSupvSessionId">
              {{ supvSaving ? 'Saving…' : 'Save changes' }}
            </button>
          </div>
          </div>
        </div>
      </div>

      <div v-if="showAgendaPanel && selectedSupvSessionId" class="modal-backdrop" @click.self="showAgendaPanel = false">
        <MeetingAgendaPanel
          :meeting-type="'supervision_session'"
          :meeting-id="selectedSupvSessionId"
          :can-add-item="true"
          @close="showAgendaPanel = false"
          @updated="() => {}"
        />
      </div>
    </div>

    <div v-if="showSupvAppVideoModal && supvAppVideoToken" class="modal-backdrop supv-video-backdrop" style="z-index: 10001;" @click.self="closeSupvAppVideoModal">
      <div class="modal supv-video-modal" :class="{ 'supv-video-fullscreen': supvAppVideoFullscreen }" @click.stop>
        <div class="modal-head supv-video-head" style="flex-shrink: 0;">
          <div class="supv-video-head-brand">
            <BrandingLogo size="medium" class="supv-video-logo" />
            <div class="modal-title">Supervision video (in-app)</div>
          </div>
          <div class="supv-video-head-actions">
            <a
              v-if="supvAppVideoOrgSlug && supvAppVideoSessionId"
              :href="`/${supvAppVideoOrgSlug}/join/supervision/${supvAppVideoSessionId}`"
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn-ghost btn-sm"
            >
              Open in new tab
            </a>
            <button class="btn btn-secondary btn-sm" type="button" @click.stop="supvAppVideoFullscreen = !supvAppVideoFullscreen">
              {{ supvAppVideoFullscreen ? 'Exit fullscreen' : 'Fullscreen' }}
            </button>
            <button class="btn btn-secondary btn-sm" type="button" @click.stop="closeSupvAppVideoModal">Close</button>
          </div>
        </div>
        <div class="modal-body supv-video-body" style="padding: 12px; overflow-y: auto; flex: 1; min-height: 0;">
          <p class="muted" style="margin-bottom: 12px;">Attendance is tracked automatically when you join and leave.</p>
          <SupervisionVideoLobbyPanel
            v-if="supvAppVideoRoomMode !== 'lobby' && supvAppVideoIsSupervisor && supvAppVideoLobbyEnabled"
            :session-id="supvAppVideoSessionId"
            :is-supervisor="supvAppVideoIsSupervisor"
          />
          <div v-else-if="supvAppVideoRoomMode === 'lobby' && supvAppVideoLobbyEnabled" class="hint" style="margin-bottom: 12px;">
            Waiting for supervisor to admit you to the room…
          </div>
          <SupervisionVideoRoom
            :token="supvAppVideoToken"
            :room-name="supvAppVideoRoomName"
            :session-title="supvAppVideoSessionTitle"
            :session-id="supvAppVideoSessionId"
            :is-host="supvAppVideoIsSupervisor"
            @disconnected="closeSupvAppVideoModal"
          />
        </div>
      </div>
    </div>
    <div v-if="supvAppVideoError" class="modal-backdrop" style="z-index: 10002;" @click.self="supvAppVideoError = ''">
      <div class="modal" style="max-width: 400px;">
        <div class="modal-head">
          <div class="modal-title">Could not join</div>
          <button class="btn btn-secondary btn-sm" type="button" @click="supvAppVideoError = ''">Close</button>
        </div>
        <div class="modal-body">
          <p class="error">{{ supvAppVideoError }}</p>
        </div>
      </div>
    </div>
    <div v-if="showSupvMeetTrackerModal" class="modal-backdrop" @click.self="endTrackedSupvMeet">
      <div class="modal" style="max-width: 560px;">
        <div class="modal-head">
          <div class="modal-title">Supervision Meet in progress</div>
          <button class="btn btn-secondary btn-sm" type="button" @click="endTrackedSupvMeet">Close</button>
        </div>
        <div class="modal-body">
          <p v-if="supvMeetTrackedSessionLabel" class="muted" style="margin-top: 0;">
            {{ supvMeetTrackedSessionLabel }}
          </p>
          <p class="muted" style="margin-top: 0;">
            Keep this modal open while meeting is active. We log when it starts and when it closes.
          </p>
          <p class="muted" style="margin: 0;">
            Google Meet opens in a separate window due browser security limits.
          </p>
          <div v-if="supvMeetTrackerError" class="error" style="margin-top: 10px;">
            {{ supvMeetTrackerError }}
          </div>
          <div class="modal-actions" style="margin-top: 12px; justify-content: flex-end;">
            <button class="btn btn-danger" type="button" :disabled="supvMeetClosing" @click="endTrackedSupvMeet">
              {{ supvMeetClosing ? 'Ending…' : 'I ended the meeting' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showStackDetailsModal" class="modal-backdrop modal-backdrop--request" @click.self="requestCloseStackDetailsModal">
      <div class="modal modal--new-request modal--stack-details" style="max-width: 680px;">
        <div class="nr-head">
          <div class="nr-head-main">
            <span class="nr-head-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8">
                <circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/>
                <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5S14 16 14.5 19"/>
              </svg>
            </span>
            <div class="nr-head-copy">
              <div class="nr-title">{{ stackDetailsTitle }}</div>
              <div class="nr-subtitle">View or edit this calendar block</div>
            </div>
          </div>
          <div class="nr-head-context">
            <button class="nr-close" type="button" aria-label="Close" @click="requestCloseStackDetailsModal">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M6 6l12 12M18 6L6 18"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="nr-chooser stack-details-body">
          <div v-if="!stackDetailsItems.length" class="muted">No overlapping details available for this block.</div>
          <div v-else class="stack-details-list">
            <div
              v-if="stackDetailsItems.length > 1"
              class="stack-details-multi-hint"
            >
              {{ stackDetailsItems.length }} items in this slot — use <strong>Edit / move</strong> on the one you want to change.
            </div>
            <div
              v-for="item in stackDetailsItems"
              :key="`stack-item-${item.id}`"
              class="stack-details-item-wrap"
              :class="{ 'stack-details-item-wrap--editing': scheduleEventEditId === Number(item.eventId || 0) }"
            >
              <div class="stack-details-static">
                <div v-if="item.kindLabel" class="stack-details-kind">{{ item.kindLabel }}</div>
                <div class="stack-details-label">{{ item.label }}</div>
                <div v-if="item.subLabel" class="stack-details-sub">{{ item.subLabel }}</div>
                <div v-if="item.detailText && scheduleEventEditId !== Number(item.eventId || 0)" class="stack-details-detail">{{ item.detailText }}</div>

                <div
                  v-if="isEditableScheduleStackItem(item) && scheduleEventEditId === Number(item.eventId || 0)"
                  class="stack-details-edit nr-appt-edit"
                >
                  <div v-if="scheduleEventEditError" class="error" style="margin-bottom: 8px;">{{ scheduleEventEditError }}</div>

                  <div class="nr-info-bar nr-info-bar--edit">
                    <div class="nr-info-cell">
                      <span class="nr-info-label">When</span>
                      <div class="nr-when-edit nr-when-edit--stack">
                        <input v-model="scheduleEventEditForm.startAt" class="nr-info-select" type="datetime-local" />
                        <span class="nr-when-sep">–</span>
                        <input v-model="scheduleEventEditForm.endAt" class="nr-info-select" type="datetime-local" />
                      </div>
                    </div>
                    <div class="nr-info-cell">
                      <span class="nr-info-label">Organization</span>
                      <select v-model.number="scheduleEventEditForm.agencyId" class="nr-info-select" @change="onScheduleEventEditAgencyChange">
                        <option :value="0">{{ scheduleEventOrgNoneLabel }}</option>
                        <option v-for="opt in scheduleEventOrgOptions" :key="`edit-org-${opt.id}`" :value="Number(opt.id)">
                          {{ opt.label }}
                        </option>
                      </select>
                    </div>
                    <div class="nr-info-cell">
                      <span class="nr-info-label">{{ isMeetingStackItem(item) ? 'Type' : 'Client' }}</span>
                      <template v-if="isMeetingStackItem(item)">
                        <span class="nr-info-value">{{ item.kindLabel || 'Meeting' }}</span>
                      </template>
                      <select
                        v-else
                        v-model.number="scheduleEventEditForm.clientId"
                        class="nr-info-select"
                        :disabled="virtualSessionClientsLoading"
                      >
                        <option :value="0">— None —</option>
                        <option
                          v-for="c in scheduleEventEditClientOptions"
                          :key="`edit-client-${c.id}`"
                          :value="Number(c.id)"
                        >
                          {{ c.displayName || c.fullName || `Client #${c.id}` }}
                        </option>
                      </select>
                    </div>
                  </div>

                  <label class="lbl">Title</label>
                  <input v-model="scheduleEventEditForm.title" class="input nr-appt-input" type="text" maxlength="200" />
                  <label class="lbl" style="margin-top: 8px;">Notes / description</label>
                  <textarea
                    v-model="scheduleEventEditForm.description"
                    class="input nr-appt-input stack-details-notes"
                    rows="3"
                    maxlength="4000"
                    placeholder="Optional notes for this event…"
                  />

                  <template v-if="isMeetingStackItem(item)">
                    <label class="lbl" style="margin-top: 12px;">Coworkers (agency staff)</label>
                    <div v-if="meetingCandidatesLoading" class="muted" style="margin-top: 4px;">Loading coworkers…</div>
                    <template v-else>
                      <input
                        v-model="meetingParticipantSearch"
                        class="input nr-appt-input"
                        type="text"
                        placeholder="Search coworkers by name or email"
                        style="margin-bottom: 8px;"
                      />
                      <div v-if="selectedMeetingParticipantChips.length" class="supervision-selected-chips">
                        <button
                          v-for="chip in selectedMeetingParticipantChips"
                          :key="`edit-meeting-chip-${chip.id}`"
                          type="button"
                          class="supervision-chip"
                          @click="removeSelectedMeetingParticipant(chip.id)"
                        >
                          <span>{{ supervisionParticipantLabel(chip.row || { id: chip.id }) }}</span>
                          <span aria-hidden="true">x</span>
                        </button>
                      </div>
                      <div class="participant-scroll" style="margin-top: 6px; max-height: 160px;">
                        <div class="participant-grid">
                          <button
                            v-for="p in filteredMeetingCandidates"
                            :key="`edit-meeting-participant-${p.id}`"
                            type="button"
                            class="participant-card participant-card--rich"
                            :class="{ on: selectedMeetingParticipantIdSet.has(Number(p.id)) }"
                            @click="toggleMeetingParticipant(Number(p.id))"
                          >
                            <img
                              v-if="participantPhotoUrl(p)"
                              class="participant-face"
                              :src="participantPhotoUrl(p)"
                              alt=""
                            />
                            <span
                              v-else
                              class="participant-face participant-face--initials"
                              aria-hidden="true"
                            >{{ providerInitials(p) }}</span>
                            <span class="participant-copy">
                              <span class="participant-name">{{ supervisionParticipantLabel(p) }}</span>
                              <span class="participant-role">{{ String(p.role || '').trim() || 'provider' }}</span>
                            </span>
                          </button>
                        </div>
                      </div>
                      <div class="muted" style="margin-top: 4px;">Selected coworkers: {{ selectedMeetingParticipantIdSet.size }}</div>
                    </template>
                  </template>

                  <label class="sched-toggle" style="margin-top: 10px;">
                    <input type="checkbox" v-model="scheduleEventEditForm.isPrivate" />
                    <span>Private on calendar</span>
                  </label>
                  <div class="nr-appt-edit-actions">
                    <button type="button" class="btn btn-secondary btn-sm" :disabled="scheduleEventSaving" @click="cancelEditScheduleStackItem">Cancel</button>
                    <button type="button" class="btn btn-primary btn-sm stack-details-edit-btn" :disabled="scheduleEventSaving" @click="saveScheduleStackItem(item)">
                      {{ scheduleEventSaving ? 'Saving…' : 'Save changes' }}
                    </button>
                  </div>
                </div>

                <div
                  v-if="item.eventKind === 'COMPANY_EVENT_BOOKING'"
                  class="stack-details-company-event"
                >
                  <div v-if="item.kioskEventPinSet" class="stack-details-kiosk-pin">
                    <span class="stack-details-kiosk-label">Kiosk passcode</span>
                    <button
                      v-if="!kioskPinRevealedByItemId[item.id]"
                      type="button"
                      class="btn btn-secondary btn-xs"
                      @click.stop="revealKioskPin(item.id)"
                    >
                      Reveal passcode
                    </button>
                    <code v-else class="stack-details-kiosk-code">{{ item.kioskEventPinCode || '—' }}</code>
                    <span v-if="!kioskPinRevealedByItemId[item.id]" class="muted stack-details-kiosk-hint">
                      Confidential — tap to show
                    </span>
                  </div>
                  <div v-if="eventCoworkersForItem(item).length" class="stack-details-coworkers">
                    <div class="stack-details-section-label">Working this session</div>
                    <ul class="stack-details-coworker-list">
                      <li v-for="p in eventCoworkersForItem(item)" :key="`cow-${item.id}-${p.userId}`">
                        {{ formatCoworkerLine(p) }}
                      </li>
                    </ul>
                  </div>
                  <div v-else class="stack-details-coworkers muted">
                    No other providers listed for this session yet.
                  </div>
                  <div class="stack-details-participants">
                    <div class="stack-details-section-label">Participants</div>
                    <span v-if="Number(item.participantCount || 0) > 0">
                      {{ item.participantCount }}
                      {{ item.participantCount === 1 ? 'participant' : 'participants' }}
                      <template v-if="formatParticipantAgesSummary(item.participantAges)">
                        · {{ formatParticipantAgesSummary(item.participantAges) }}
                      </template>
                    </span>
                    <span v-else class="muted">No enrolled participants yet.</span>
                  </div>
                </div>
              </div>
              <div v-if="item.therapyNoteAid" class="stack-details-actions" style="margin-top: 8px;">
                <button type="button" class="btn btn-primary btn-sm" @click.stop="openTherapyNoteAid(item)">
                  Open Note Aid
                </button>
              </div>
              <button
                v-if="stackItemHasAction(item)"
                class="btn btn-secondary btn-sm stack-details-open-btn"
                type="button"
                @click="openStackDetailsItem(item)"
              >
                {{ stackItemActionLabel(item) }}
              </button>
              <div v-if="item.eventId && item.appJoinUrl" class="stack-details-activity-row">
                <button
                  type="button"
                  class="btn btn-outline btn-sm"
                  :disabled="teamMeetingActivityLoadingById[item.eventId]"
                  @click.stop="toggleTeamMeetingActivity(item.eventId)"
                >
                  {{ teamMeetingActivityExpandedById[item.eventId] ? 'Hide' : 'View' }} meeting chat & Q&A
                </button>
                <div v-if="teamMeetingActivityExpandedById[item.eventId]" class="stack-details-activity-content">
                  <div v-if="teamMeetingActivityLoadingById[item.eventId]" class="muted">Loading…</div>
                  <div v-else-if="teamMeetingActivityErrorById[item.eventId]" class="error-inline">{{ teamMeetingActivityErrorById[item.eventId] }}</div>
                  <div v-else-if="!teamMeetingActivityById[item.eventId]?.length" class="muted">No chat, polls, or Q&A recorded for this meeting.</div>
                  <div v-else class="activity-list">
                    <div
                      v-for="a in teamMeetingActivityById[item.eventId]"
                      :key="a.id"
                      class="activity-item"
                      :class="`activity-${a.activityType}`"
                    >
                      <span class="activity-sender">{{ a.participantIdentity?.replace(/^user-/, 'User ') }}</span>
                      <span v-if="a.activityType === 'chat'" class="activity-text">{{ a.payload?.text }}</span>
                      <span v-else-if="a.activityType === 'poll'" class="activity-text">Poll: {{ a.payload?.question }} — {{ (a.payload?.options || []).join(', ') }}</span>
                      <span v-else-if="a.activityType === 'poll_vote'" class="activity-text">Voted on poll</span>
                      <span v-else-if="a.activityType === 'question'" class="activity-text">Q: {{ a.payload?.text }}</span>
                      <span v-else-if="a.activityType === 'answer'" class="activity-text">A: {{ a.payload?.text }}</span>
                      <span class="activity-time">{{ formatActivityTime(a.createdAt) }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div
                v-if="isEditableScheduleStackItem(item) && scheduleEventEditId !== Number(item.eventId || 0)"
                class="stack-details-actions"
                style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;"
              >
                <button
                  type="button"
                  class="btn btn-primary btn-sm stack-details-edit-btn"
                  @click.stop="openAppointmentEditInScheduleModal({
                    item,
                    items: stackDetailsItems,
                    dayName: stackDetailsDayName,
                    hour: stackDetailsHour,
                    minute: stackDetailsMinute,
                    focusEventId: item.eventId
                  })"
                >
                  Edit / move
                </button>
                <button
                  v-if="item.appJoinUrl || item.meetLink"
                  type="button"
                  class="btn btn-secondary btn-sm"
                  @click.stop="openStackDetailsItem(item)"
                >
                  {{ item.appJoinUrl ? 'Open video room' : 'Open meeting link' }}
                </button>
                <button
                  type="button"
                  class="btn btn-danger btn-sm"
                  :disabled="deletingScheduleEventId === item.eventId"
                  @click.stop="deleteScheduleMeetingOccurrence(item)"
                >
                  {{ deletingScheduleEventId === item.eventId && deletingScheduleEventScope === 'single' ? 'Deleting…' : 'Delete' }}
                </button>
                <button
                  v-if="item.recurrenceSeriesId"
                  type="button"
                  class="btn btn-secondary btn-sm"
                  :disabled="deletingScheduleEventId === item.eventId"
                  @click.stop="deleteScheduleMeetingFuture(item)"
                >
                  {{ deletingScheduleEventId === item.eventId && deletingScheduleEventScope === 'future' ? 'Deleting…' : 'Delete this & future' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showGoogleEventModal" class="modal-backdrop" @click.self="closeGoogleEventModal">
      <div class="modal google-event-modal" style="max-width: 480px;">
        <div class="modal-head">
          <div class="modal-title">{{ googleEventEditMode ? 'Edit event' : (selectedGoogleEvent?.summary || 'Google event') }}</div>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeGoogleEventModal">Close</button>
        </div>
        <div class="modal-body">
          <div v-if="selectedGoogleEvent" class="google-event-details">
            <template v-if="googleEventEditMode">
              <div v-if="googleEventSaveError" class="error" style="margin-bottom: 10px;">{{ googleEventSaveError }}</div>
              <div class="field" style="margin-bottom: 10px;">
                <label class="lbl">Title</label>
                <input v-model="googleEventEditForm.summary" type="text" class="input" placeholder="Event title" />
              </div>
              <div class="field" style="margin-bottom: 10px;">
                <label class="lbl">Description</label>
                <textarea v-model="googleEventEditForm.description" class="input" rows="3" placeholder="Description" />
              </div>
              <div class="field" style="margin-bottom: 10px;">
                <label class="lbl">Location</label>
                <input v-model="googleEventEditForm.location" type="text" class="input" placeholder="Location" />
              </div>
              <div class="field-grid" style="margin-bottom: 12px;">
                <div class="field">
                  <label class="lbl">Start</label>
                  <input v-model="googleEventEditForm.startAt" type="datetime-local" class="input" />
                </div>
                <div class="field">
                  <label class="lbl">End</label>
                  <input v-model="googleEventEditForm.endAt" type="datetime-local" class="input" />
                </div>
              </div>
              <p v-if="bookingTimezoneLabel" class="muted" style="margin: -4px 0 12px; font-size: 12px;">
                Times are in {{ bookingTimezoneLabel }}
              </p>
              <div class="google-event-actions" style="display: flex; justify-content: space-between; align-items: center;">
                <button type="button" class="btn btn-danger btn-sm" :disabled="googleEventSaving" @click="deleteGoogleEvent">Delete</button>
                <div style="display: flex; gap: 8px;">
                  <button type="button" class="btn btn-secondary btn-sm" :disabled="googleEventSaving" @click="cancelEditGoogleEvent">Cancel</button>
                  <button type="button" class="btn btn-primary btn-sm" :disabled="googleEventSaving" @click="saveGoogleEvent">Save</button>
                </div>
              </div>
            </template>
            <template v-else>
              <div v-if="googleEventSaveError" class="error" style="margin-bottom: 10px;">{{ googleEventSaveError }}</div>
              <div v-if="googleEventFetching" class="muted">Loading…</div>
              <template v-else>
                <div class="google-event-time">
                  {{ formatRangeFromRaw(selectedGoogleEvent.startAt, selectedGoogleEvent.endAt) }}
                </div>
                <div v-if="selectedGoogleEvent.location" class="google-event-location muted" style="margin-top: 6px;">
                  {{ selectedGoogleEvent.location }}
                </div>
                <div class="google-event-actions" style="margin-top: 12px;">
                  <button
                    v-if="linkedScheduleEventForGoogleModal?.appJoinUrl"
                    type="button"
                    class="btn btn-primary btn-sm"
                    style="margin-right: 8px;"
                    @click="window.location.href = linkedScheduleEventForGoogleModal.appJoinUrl"
                  >
                    Join in PT app
                  </button>
                  <button
                    v-if="selectedGoogleEvent.meetLink"
                    type="button"
                    class="btn btn-primary btn-sm"
                    style="margin-right: 8px;"
                    @click="openMeetInPopup(selectedGoogleEvent.meetLink)"
                  >
                    Join meeting
                  </button>
                  <button
                    v-if="selectedGoogleEvent.htmlLink"
                    type="button"
                    class="btn btn-secondary btn-sm"
                    style="margin-right: 8px;"
                    @click="openGoogleEventInPopup(selectedGoogleEvent)"
                  >
                    Open in Google Calendar
                  </button>
                  <button
                    v-if="canEditGoogleEvent"
                    type="button"
                    class="btn btn-secondary btn-sm"
                    style="margin-right: 8px;"
                    @click="startEditGoogleEvent"
                  >
                    Edit
                  </button>
                  <button
                    v-if="canEditGoogleEvent"
                    type="button"
                    class="btn btn-danger btn-sm"
                    @click="deleteGoogleEvent"
                  >
                    Delete
                  </button>
                </div>
                <span v-if="selectedGoogleEvent.htmlLink && !canEditGoogleEvent" class="hint" style="margin-top: 8px; display: block;">
                  Edit the event or join a meeting from Google Calendar. Opens in a popup so you stay in the app.
                </span>
              </template>
            </template>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showOfficeAssignModal" class="modal-backdrop" @click.self="closeOfficeAssignModal">
      <div class="modal">
        <div class="modal-head">
          <div class="modal-title">Assign office slot</div>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeOfficeAssignModal">Close</button>
        </div>

        <div v-if="officeAssignError" class="error" style="margin-top: 10px;">{{ officeAssignError }}</div>

        <div class="muted" style="margin-top: 6px;">
          {{ officeAssignDay }} • {{ hourLabel(officeAssignStartHour) }}–{{ hourLabel(officeAssignEndHour) }}
        </div>

        <div class="modal-body">
          <div class="field-grid">
            <div>
              <label class="lbl">Office location</label>
              <select v-model.number="officeAssignBuildingId" class="input" :disabled="officeAssignLoading">
                <option :value="0">Select…</option>
                <option v-for="o in officeLocations" :key="`bld-${o.id}`" :value="Number(o.id)">{{ o.name }}</option>
              </select>
            </div>
            <div>
              <label class="lbl">Office</label>
              <select v-model.number="officeAssignRoomId" class="input" :disabled="officeAssignLoading || !officeAssignBuildingId">
                <option :value="0">Select…</option>
                <option v-for="r in officeRooms" :key="`room-${r.id}`" :value="Number(r.id)">
                  {{ r.roomNumber ? `#${r.roomNumber}` : '' }} {{ r.label || r.name }}
                </option>
              </select>
            </div>
          </div>

          <div style="margin-top: 10px;">
            <label class="lbl">End time</label>
            <select v-model.number="officeAssignEndHour" class="input" :disabled="officeAssignLoading">
              <option v-for="h in officeAssignEndHourOptions" :key="`oa-end-${h}`" :value="h">
                {{ hourLabel(h) }}
              </option>
            </select>
          </div>

          <div class="modal-actions" style="justify-content: space-between;">
            <div class="muted" style="font-size: 12px;">
              Assigns {{ isAdminMode ? 'this user' : '' }} without a request.
            </div>
            <button class="btn btn-primary" type="button" @click="submitOfficeAssign" :disabled="officeAssignLoading || !officeAssignBuildingId || !officeAssignRoomId">
              {{ officeAssignLoading ? 'Assigning…' : 'Assign' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <UnifiedBookingPanel
      :open="showUnifiedBookingPanel"
      :agency-id="Number(effectiveAgencyId || 0)"
      :provider-user-id-default="Number(userId || 0)"
      :start-at="unifiedBookingStartAt"
      :end-at="unifiedBookingEndAt"
      :day-label="unifiedBookingDayLabel"
      @close="showUnifiedBookingPanel = false"
      @booked="onUnifiedBookingBooked"
    />

    <div
      v-if="peerActivityModal"
      class="modal-backdrop modal-backdrop--request"
      @click.self="closePeerActivityModal"
    >
      <div class="modal modal--slot-info peer-activity-modal" data-tour="peer-activity-modal">
        <div class="modal-head">
          <div class="modal-title" style="display: flex; align-items: center; gap: 8px;">
            <span
              class="peer-busy-swatch"
              :style="{ background: peerActivityModal.color, width: '12px', height: '12px' }"
              aria-hidden="true"
            ></span>
            <img
              v-if="peerActivityModal.agencyId && agencyIconUrlById(peerActivityModal.agencyId)"
              class="peer-busy-tenant-icon"
              :src="agencyIconUrlById(peerActivityModal.agencyId)"
              alt=""
            />
            <span>{{ peerActivityModal.label }}</span>
          </div>
          <button class="btn btn-secondary btn-sm" type="button" @click="closePeerActivityModal">Close</button>
        </div>
        <div class="muted" style="font-size: 12px; margin-bottom: 10px;">
          {{ peerActivityModal.dayName }} {{ hourLabel(peerActivityModal.hour) }}
          · {{ canManagePeerCalendar ? 'Inspect and manage from Staff schedules' : 'Activity type (client details hidden)' }}
        </div>
        <div class="peer-activity-list">
          <div
            v-for="(act, idx) in peerActivityModal.activities"
            :key="`peer-act-${idx}`"
            class="peer-activity-row"
          >
            <span
              class="peer-activity-type"
              :class="`peer-activity-type--${String(act.activityType || 'busy').toLowerCase()}`"
            >{{ peerActivityShortLabel(act.activityType) }}</span>
            <div class="peer-activity-body">
              <div class="peer-activity-title">{{ act.title || peerActivityShortLabel(act.activityType) }}</div>
              <div v-if="act.officeLabel" class="muted" style="font-size: 12px;">{{ act.officeLabel }}</div>
            </div>
          </div>
          <div v-if="!(peerActivityModal.activities || []).length" class="muted">No activity details for this slot.</div>
        </div>
        <div v-if="peerActivityModal.canManage" class="modal-actions" style="margin-top: 14px;">
          <button class="btn btn-primary" type="button" @click="openPeerStaffSchedule">
            Open schedule to edit
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import './schedule-new-request-modal.css';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { createCounselingSession, openCounselingFromAppointment } from '../../services/counselingApi.js';
import { isSupervisor } from '../../utils/helpers.js';
import api from '../../services/api';
import { getScheduleSummary, setScheduleSummary, invalidateScheduleSummaryCacheForUser } from '../../utils/scheduleSummaryCache';
import { timezoneLabelFor } from '../../utils/timezones.js';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import { useUserPreferencesStore } from '../../store/userPreferences';
import { isMedicalBillingEnabled } from '../../config/medicalBillingAccess.js';
import { isTenantOrganizationType as isTenantOrganizationTypeShared } from '../../utils/organizationTypes.js';
import OfficeWeeklyRoomGrid from './OfficeWeeklyRoomGrid.vue';
import MeetingAgendaPanel from '../meetings/MeetingAgendaPanel.vue';
import BrandingLogo from '../BrandingLogo.vue';
import SupervisionVideoRoom from '../supervision/SupervisionVideoRoom.vue';
import SupervisionVideoLobbyPanel from '../supervision/SupervisionVideoLobbyPanel.vue';
import UnifiedBookingPanel from './UnifiedBookingPanel.vue';
import PersonSearchSelect from './PersonSearchSelect.vue';

const props = defineProps({
  userId: { type: Number, required: true },
  agencyId: { type: [Number, String], default: null },
  // Optional: multi-agency mode (admin viewing a user's schedule across multiple agencies).
  // When provided (non-empty), the grid loads and merges schedule summaries for each agency.
  agencyIds: { type: Array, default: null },
  // Optional: map of agencyId -> label for tooltips (helps explain overlaps).
  agencyLabelById: { type: Object, default: null },
  mode: { type: String, default: 'self' }, // 'self' | 'admin'
  // Optional: parent-controlled weekStart (any date; normalized to Monday).
  weekStartYmd: { type: String, default: null },
  weekStartsOn: { type: String, default: 'monday' },
  // Optional: availability overlay (computed server-side), to highlight open slots.
  availabilityOverlay: { type: Object, default: null },
  // Club/affiliation context: hide office space, Open finder, Google busy, Therapy Notes.
  hideOfficeAndCalendarIntegration: { type: Boolean, default: false },
  showSkillBuildersProgramsButton: { type: Boolean, default: false },
  showCompanyEventsCalendarButton: { type: Boolean, default: true },
  /** Hide the large duplicate “Schedule” heading when the parent page already has a title. */
  compactPageChrome: { type: Boolean, default: false },
  /** Plot Twist HQ embed: dark platform chrome instead of default light schedule page. */
  platformTheme: { type: Boolean, default: false }
});
const emit = defineEmits([
  'update:weekStartYmd',
  'open-skill-builders-programs',
  'open-company-events-calendar',
  'change-schedule-user'
]);

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();

const isDocumentDark = ref(
  typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'
);
/** HQ embed or user dark-mode preference — shared purple/slate schedule chrome. */
const darkScheduleTheme = computed(() => props.platformTheme || isDocumentDark.value);

let darkThemeObserver = null;
const scheduleOrgSlug = computed(() => (
  typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : ''
));
const scheduleOrgTo = (path) => (scheduleOrgSlug.value ? `/${scheduleOrgSlug.value}${path}` : path);
const staffSchedulesCompareTo = computed(() => scheduleOrgTo('/schedule/staff'));

const showUnifiedBookingPanel = ref(false);
const unifiedBookingStartAt = ref('');
const unifiedBookingEndAt = ref('');
const unifiedBookingDayLabel = ref('');

const buildUnifiedBookingWallTime = (dayName, hour, minute = 0) => {
  const dateYmd = addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dayName));
  const pad = (n) => String(Number(n) || 0).padStart(2, '0');
  return `${dateYmd} ${pad(hour)}:${pad(minute)}:00`;
};

const openUnifiedBookingPanel = (dayName = null, hour = null) => {
  const dn = dayName || modalDay.value || visibleDays.value?.[0] || 'Monday';
  const h = hour != null ? Number(hour) : Number(modalHour.value || 9);
  const endH = Number(modalEndHour.value || (h + 1));
  unifiedBookingDayLabel.value = `${dn} ${hourLabel(h)}`;
  unifiedBookingStartAt.value = buildUnifiedBookingWallTime(dn, h, Number(modalStartMinute.value || 0));
  unifiedBookingEndAt.value = buildUnifiedBookingWallTime(dn, endH, Number(modalEndMinute.value || 0));
  showUnifiedBookingPanel.value = true;
};

const onUnifiedBookingBooked = async () => {
  invalidateScheduleSummaryCacheForUser(props.userId);
  await load({ forceRefresh: true });
};

const supvAppVideoOrgSlug = computed(() => String(route.params?.organizationSlug || '').trim());

const defaultScheduleColors = () => ({
  request: '#F2C94C',
  school: '#2D9CDB',
  supervision: '#9B51E0',
  office_assigned: '#27AE60',
  office_temporary: '#9B51E0',
  office_booked: '#EB5757',
  google_busy: '#111827',
  ehr_busy: '#F2994A'
});

const scheduleColors = ref(defaultScheduleColors());

const parseJsonMaybe = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

const loadMyScheduleColors = async () => {
  try {
    const myId = Number(authStore.user?.id || 0);
    if (!myId) return;
    const resp = await api.get(`/users/${myId}/preferences`);
    const colors = parseJsonMaybe(resp.data?.schedule_color_overrides);
    scheduleColors.value = { ...defaultScheduleColors(), ...(colors || {}) };
  } catch {
    // best effort; fall back to defaults
    scheduleColors.value = defaultScheduleColors();
  }
};

const clampHex = (hex) => {
  const s = String(hex || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1], g = s[2], b = s[3];
    return (`#${r}${r}${g}${g}${b}${b}`).toUpperCase();
  }
  return null;
};

const hexToRgb = (hex) => {
  const h = clampHex(hex);
  if (!h) return null;
  const x = h.slice(1);
  const r = parseInt(x.slice(0, 2), 16);
  const g = parseInt(x.slice(2, 4), 16);
  const b = parseInt(x.slice(4, 6), 16);
  if (![r, g, b].every((n) => Number.isFinite(n))) return null;
  return { r, g, b };
};

const rgba = (hex, a) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const alpha = Math.max(0, Math.min(1, Number(a)));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
};

const scheduleColorVars = computed(() => {
  const c = scheduleColors.value || {};
  const req = c.request;
  const school = c.school;
  const supv = c.supervision;
  const oa = c.office_assigned;
  const ot = c.office_temporary;
  const ob = c.office_booked;
  const gb = c.google_busy;
  const eb = c.ehr_busy;

  const v = {};
  const set = (k, bgA, borderA) => {
    const bg = rgba(k, bgA);
    const br = rgba(k, borderA);
    return { bg, br };
  };

  const reqv = set(req, darkScheduleTheme.value ? 0.52 : 0.35, darkScheduleTheme.value ? 0.78 : 0.65);
  const schv = set(school, darkScheduleTheme.value ? 0.46 : 0.28, darkScheduleTheme.value ? 0.76 : 0.60);
  const supvv = set(supv, darkScheduleTheme.value ? 0.42 : 0.20, darkScheduleTheme.value ? 0.72 : 0.55);
  const oav = set(oa, darkScheduleTheme.value ? 0.48 : 0.22, darkScheduleTheme.value ? 0.78 : 0.55);
  const otv = set(ot, darkScheduleTheme.value ? 0.50 : 0.24, darkScheduleTheme.value ? 0.80 : 0.58);
  const obv = set(ob, darkScheduleTheme.value ? 0.50 : 0.22, darkScheduleTheme.value ? 0.80 : 0.58);
  const gbv = set(gb, darkScheduleTheme.value ? 0.28 : 0.14, darkScheduleTheme.value ? 0.58 : 0.42);
  const ebv = set(eb, darkScheduleTheme.value ? 0.32 : 0.16, darkScheduleTheme.value ? 0.62 : 0.45);

  if (reqv.bg) v['--sched-request-bg'] = reqv.bg;
  if (reqv.br) v['--sched-request-border'] = reqv.br;
  if (schv.bg) v['--sched-school-bg'] = schv.bg;
  if (schv.br) v['--sched-school-border'] = schv.br;
  if (supvv.bg) v['--sched-supv-bg'] = supvv.bg;
  if (supvv.br) v['--sched-supv-border'] = supvv.br;
  if (oav.bg) v['--sched-oa-bg'] = oav.bg;
  if (oav.br) v['--sched-oa-border'] = oav.br;
  if (otv.bg) v['--sched-ot-bg'] = otv.bg;
  if (otv.br) v['--sched-ot-border'] = otv.br;
  if (obv.bg) v['--sched-ob-bg'] = obv.bg;
  if (obv.br) v['--sched-ob-border'] = obv.br;
  if (gbv.bg) v['--sched-gbusy-bg'] = gbv.bg;
  if (gbv.br) v['--sched-gbusy-border'] = gbv.br;
  if (ebv.bg) v['--sched-ebusy-bg'] = ebv.bg;
  if (ebv.br) v['--sched-ebusy-border'] = ebv.br;
  return v;
});
const rowHeightPx = computed(() => {
  const mode = String(rowHeightMode.value || 'normal');
  if (mode === 'compact') return 28;
  if (mode === 'large') return 46;
  if (mode === 'xl') return 58;
  return 32;
});
const scheduleWrapVars = computed(() => ({
  ...(scheduleColorVars.value || {}),
  '--sched-cell-min-height': `${rowHeightPx.value}px`
}));

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SUNDAY_FIRST_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// Must be declared before dayIdxFromWeekStartMonday (same block) so the helper never closes over a TDZ binding.
const weekStartsOnLocal = ref(
  typeof window !== 'undefined' && window.localStorage.getItem('schedule.weekStartsOn') === 'sunday'
    ? 'sunday'
    : 'monday'
);
const effectiveWeekStartsOn = computed(() => {
  if (props.mode === 'self') return weekStartsOnLocal.value === 'sunday' ? 'sunday' : 'monday';
  return String(props.weekStartsOn || '').toLowerCase() === 'sunday' ? 'sunday' : 'monday';
});
const orderedDays = computed(() => (effectiveWeekStartsOn.value === 'sunday' ? SUNDAY_FIRST_DAYS : ALL_DAYS));
/**
 * Anchor `weekStart` YMD is always Monday. Use the same column order as `orderedDays` so headers/cells
 * cannot drift from `effectiveWeekStartsOn` (avoids stale closure / evaluation-order bugs in HMR).
 */
const dayIdxFromWeekStartMonday = (dayName) => {
  const idx = ALL_DAYS.indexOf(String(dayName || ''));
  if (idx < 0) return 0;
  const sunFirst = orderedDays.value.length > 0 && orderedDays.value[0] === 'Sunday';
  if (sunFirst) return idx === 6 ? -1 : idx;
  return idx;
};

// Default working-hours band; Full day (24h) expands to 0–23 (12 AM–11 PM).
const showAllHours = ref(false);
const hours = computed(() => {
  if (showAllHours.value) {
    return Array.from({ length: 24 }, (_, i) => i); // 0..23 full 24h
  }
  if (props.hideOfficeAndCalendarIntegration) {
    return Array.from({ length: 18 }, (_, i) => 5 + i); // 5..22 club / early starts
  }
  return Array.from({ length: 15 }, (_, i) => 7 + i); // 7..21 default clinical day
});
const gridMinHour = computed(() => (hours.value?.length ? Math.min(...hours.value) : 7));
const gridMaxHour = computed(() => (hours.value?.length ? Math.max(...hours.value) + 1 : 22));

const loading = ref(false);
const error = ref('');
const summary = ref(null);

// ---- Overlay visibility (persisted locally for providers) ----
// Defaults for provider UX:
// - Google busy: ON
// - Google titles: OFF (sensitive)
// - External/Therapy Notes calendars: ALL ON (once available list is loaded)
const showGoogleBusy = ref(true);
const showGoogleEvents = ref(false);
const showExternalBusy = ref(true);
const showOfficeOverlay = ref(true);
const showQuarterDetail = ref(false);
/** Peer busy overlay on My Schedule (anonymous intervals unless privileged Show details). */
const showPeerBusyOverlay = ref(false);
const peerBusySearch = ref('');
const peerBusyCandidates = ref([]);
const peerBusySelectedIds = ref([]);
const peerBusySummariesByUserId = ref({});
const peerBusyLoading = ref(false);
const peerBusyError = ref('');
const maxPeerBusySelected = 6;
const PEER_BUSY_EXCLUDED_ROLES = new Set([
  'client_guardian', 'guardian', 'school_staff', 'school_support',
  'client', 'parent', 'kiosk', 'super_admin', 'superadmin'
]);
const parsePeerAgencyIds = (raw) => {
  if (Array.isArray(raw)) {
    return raw.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  }
  return String(raw || '')
    .split(',')
    .map((s) => Number(String(s || '').trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
};
const peerMatchesScheduleAgencies = (user, agencyIds = effectiveAgencyIds.value) => {
  const scope = (agencyIds || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  if (!scope.length) return false;
  const userAgencyIds = parsePeerAgencyIds(user?.agencyIds ?? user?.agency_ids);
  if (!userAgencyIds.length) return false;
  return userAgencyIds.some((id) => scope.includes(id));
};
const isPeerBusyCandidate = (user) => {
  const role = String(user?.role || '').trim().toLowerCase();
  if (role && PEER_BUSY_EXCLUDED_ROLES.has(role)) return false;
  return peerMatchesScheduleAgencies(user);
};
const peerBusyLoadGeneration = ref(0);
/** When true, external ICS blocks stay visible but SUMMARY/titles are not shown (generic labels only). */
const hideExternalIcsTitles = ref(false);
const selectedExternalCalendarIds = ref([]); // populated from available list once loaded
const selectedExternalCalendarIdSet = computed(
  () =>
    new Set(
      (selectedExternalCalendarIds.value || [])
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
);
let schedMouseUpHandler = null;
const hideWeekend = ref(props.mode === 'self');
const focusedDays = ref([]);
/** day = single-day focus (+ mobile timeline); week = full multi-day grid */
const scheduleSpanMode = ref('week');
const isNarrowSchedule = ref(false);
let narrowScheduleMql = null;
let narrowScheduleHandler = null;
const todayDayName = () => {
  const map = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return map[new Date().getDay()] || 'Monday';
};
const setScheduleSpanMode = (mode) => {
  const next = String(mode || '').toLowerCase() === 'day' ? 'day' : 'week';
  scheduleSpanMode.value = next;
  if (next === 'day') {
    const today = todayDayName();
    const allowed = focusableDays.value || [];
    focusedDays.value = allowed.includes(today) ? [today] : (allowed[0] ? [allowed[0]] : []);
  } else {
    focusedDays.value = [];
  }
};
const showMobileDayTimeline = computed(() => (
  isNarrowSchedule.value
  && scheduleSpanMode.value === 'day'
  && viewMode.value !== 'office_layout'
  && !!summary.value
));
const mobileTimelineDay = computed(() => {
  const days = visibleDays.value || [];
  if (days.length === 1) return days[0];
  const today = todayDayName();
  if ((focusableDays.value || []).includes(today)) return today;
  return days[0] || today;
});
const mobileTimelineHours = computed(() => (Array.isArray(hours.value) ? hours.value : []));
const mobileDayCardsForHour = (hour) => {
  const day = mobileTimelineDay.value;
  if (!day) return [];
  return (cellBlocks(day, hour, 0) || []).filter((b) => b && b.kind !== 'more');
};
const openMobileDayHour = (hour) => {
  openSlotActionModal({
    dayName: mobileTimelineDay.value,
    hour: Number(hour),
    preserveSelectionRange: false,
    actionSource: 'plus_or_blank'
  });
};
const rowHeightMode = ref('normal');
const initializedOverlayDefaults = ref(false);

const viewMode = ref('open_finder'); // 'open_finder' | 'office_layout' (office_layout implemented later)

const toggleWeekStartsOn = () => {
  if (props.mode !== 'self') return;
  weekStartsOnLocal.value = weekStartsOnLocal.value === 'monday' ? 'sunday' : 'monday';
  try {
    window?.localStorage?.setItem?.('schedule.weekStartsOn', weekStartsOnLocal.value);
  } catch {
    // ignore best-effort persistence
  }
};

const overlayPrefsKey = computed(() => {
  if (props.mode !== 'self') return '';
  const uid = Number(authStore.user?.id || props.userId || 0);
  if (!uid) return '';
  const agencyId = Number(props.agencyId || 0);
  // In self multi-organization mode, props.agencyId is intentionally null.
  // Persist under a stable user-scoped key so overlay selections do not reset.
  const scope = agencyId > 0 ? String(agencyId) : 'multi';
  return `schedule.overlayPrefs.v2:${uid}:${scope}`;
});

const hideWeekendPrefsKey = computed(() => {
  if (props.mode !== 'self') return '';
  const uid = Number(authStore.user?.id || props.userId || 0);
  if (!uid) return '';
  return `schedule.hideWeekend.v1:${uid}`;
});

const showAllHoursPrefsKey = computed(() => {
  if (props.mode !== 'self') return '';
  const uid = Number(authStore.user?.id || props.userId || 0);
  if (!uid) return '';
  return `schedule.showAllHours.v1:${uid}`;
});

const lastCalendarPrefs = ref(null); // { showGoogleBusy, showGoogleEvents, selectedExternalCalendarIds }
const overlayPrefsLoaded = ref(false);
const shouldDefaultSelectAllExternal = ref(false);

const coerceIdArray = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);

const loadOverlayPrefs = () => {
  if (!overlayPrefsKey.value) return null;
  try {
    const raw = window?.localStorage?.getItem?.(overlayPrefsKey.value);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const loadHideWeekendPref = () => {
  if (!hideWeekendPrefsKey.value) return null;
  try {
    const raw = window?.localStorage?.getItem?.(hideWeekendPrefsKey.value);
    if (raw === null || raw === undefined) return null;
    const value = String(raw).trim().toLowerCase();
    if (value === '1' || value === 'true') return true;
    if (value === '0' || value === 'false') return false;
    return null;
  } catch {
    return null;
  }
};

const saveHideWeekendPref = () => {
  if (!hideWeekendPrefsKey.value) return;
  try {
    window?.localStorage?.setItem?.(hideWeekendPrefsKey.value, hideWeekend.value ? '1' : '0');
  } catch {
    // ignore best-effort persistence
  }
};

const loadShowAllHoursPref = () => {
  if (!showAllHoursPrefsKey.value) return null;
  try {
    const raw = window?.localStorage?.getItem?.(showAllHoursPrefsKey.value);
    if (raw === null || raw === undefined) return null;
    const value = String(raw).trim().toLowerCase();
    if (value === '1' || value === 'true') return true;
    if (value === '0' || value === 'false') return false;
    return null;
  } catch {
    return null;
  }
};

const saveShowAllHoursPref = () => {
  if (!showAllHoursPrefsKey.value) return;
  try {
    window?.localStorage?.setItem?.(showAllHoursPrefsKey.value, showAllHours.value ? '1' : '0');
  } catch {
    // ignore best-effort persistence
  }
};

const saveOverlayPrefs = () => {
  if (!overlayPrefsKey.value) return;
  try {
    const payload = {
      showGoogleBusy: !!showGoogleBusy.value,
      showGoogleEvents: !!showGoogleEvents.value,
      showExternalBusy: !!showExternalBusy.value,
      showOfficeOverlay: !!showOfficeOverlay.value,
      hideExternalIcsTitles: !!hideExternalIcsTitles.value,
      selectedExternalCalendarIds: coerceIdArray(selectedExternalCalendarIds.value),
      hideWeekend: !!hideWeekend.value,
      showAllHours: !!showAllHours.value,
      viewMode: String(viewMode.value || 'open_finder'),
      lastCalendarPrefs: lastCalendarPrefs.value
        ? {
            showGoogleBusy: !!lastCalendarPrefs.value.showGoogleBusy,
            showGoogleEvents: !!lastCalendarPrefs.value.showGoogleEvents,
            selectedExternalCalendarIds: coerceIdArray(lastCalendarPrefs.value.selectedExternalCalendarIds)
          }
        : null
    };
    window?.localStorage?.setItem?.(overlayPrefsKey.value, JSON.stringify(payload));
  } catch {
    // ignore best-effort persistence
  }
};

const calendarsHidden = computed(
  () =>
    !showGoogleBusy.value &&
    !showGoogleEvents.value &&
    (!showExternalBusy.value || (Array.isArray(selectedExternalCalendarIds.value) ? selectedExternalCalendarIds.value : []).length === 0)
);

const selectAllExternalCalendars = () => {
  selectedExternalCalendarIds.value = (externalCalendarsAvailable.value || []).map((c) => Number(c.id)).filter((n) => Number.isFinite(n) && n > 0);
};

const clearExternalCalendars = () => {
  selectedExternalCalendarIds.value = [];
};

const toggleExternalBusy = () => {
  if (!externalCalendarsAvailable.value.length) return;
  showExternalBusy.value = !showExternalBusy.value;
  if (showExternalBusy.value && selectedExternalCalendarIds.value.length === 0) {
    selectAllExternalCalendars();
  }
};

const toggleExternalCalendar = (id) => {
  const n = Number(id || 0);
  if (!Number.isFinite(n) || n <= 0) return;
  const cur = new Set((selectedExternalCalendarIds.value || []).map((x) => Number(x)));
  if (cur.has(n)) cur.delete(n);
  else cur.add(n);
  selectedExternalCalendarIds.value = Array.from(cur.values());
};

const normalizeGoogleOverlayMode = (prefer = 'events') => {
  if (!(showGoogleBusy.value && showGoogleEvents.value)) return;
  if (prefer === 'busy') showGoogleEvents.value = false;
  else showGoogleBusy.value = false;
};

const toggleGoogleBusy = () => {
  const next = !showGoogleBusy.value;
  showGoogleBusy.value = next;
  if (next) showGoogleEvents.value = false;
};

const toggleGoogleEvents = () => {
  const next = !showGoogleEvents.value;
  showGoogleEvents.value = next;
  if (next) showGoogleBusy.value = false;
};

const canShowPeerScheduleDetails = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return ['super_admin', 'superadmin', 'admin', 'support', 'clinical_practice_assistant'].includes(role)
    || isSupervisor(authStore.user);
});
/** Privileged roles may open/edit peer calendars from the overlay. */
const canManagePeerCalendar = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return ['super_admin', 'superadmin', 'admin', 'support'].includes(role)
    || isSupervisor(authStore.user);
});
const peerBusySelectedIdSet = computed(() => new Set((peerBusySelectedIds.value || []).map((n) => Number(n)).filter((n) => n > 0)));
/** Privileged → full payload; everyone else → typed (activity + office, no client PII). */
const peerBusyDetailLevel = computed(() => (
  canShowPeerScheduleDetails.value ? 'full' : 'typed'
));
const peerColorPalette = [
  '#0f766e', // teal
  '#7c3aed', // violet
  '#c2410c', // orange
  '#1d4ed8', // blue
  '#be185d', // pink
  '#a16207' // amber
];
const peerColorById = (uid) => {
  const n = Number(uid || 0);
  if (!Number.isFinite(n) || n <= 0) return '#64748b';
  return peerColorPalette[n % peerColorPalette.length];
};
const peerPrimaryAgencyIconUrl = (peer) => {
  const ids = parsePeerAgencyIds(peer?.agencyIds ?? peer?.agency_ids);
  const scope = (effectiveAgencyIds.value || []).map((n) => Number(n)).filter((n) => n > 0);
  const preferred = ids.find((id) => scope.includes(id)) || ids[0] || 0;
  return preferred ? agencyIconUrlById(preferred) : null;
};
const filteredPeerBusyCandidates = computed(() => {
  const q = String(peerBusySearch.value || '').trim().toLowerCase();
  const me = Number(authStore.user?.id || 0);
  const rows = (peerBusyCandidates.value || []).filter((p) => Number(p?.id || 0) !== me);
  if (!q) return rows;
  return rows.filter((p) => String(p?.label || '').toLowerCase().includes(q) || String(p?.email || '').toLowerCase().includes(q));
});
const peerInitials = (uid) => {
  const row = (peerBusyCandidates.value || []).find((p) => Number(p.id) === Number(uid));
  const label = String(row?.label || '').trim();
  const parts = label.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : '';
  return (first + last).toUpperCase() || String(uid);
};
const peerLabelById = (uid) => {
  const row = (peerBusyCandidates.value || []).find((p) => Number(p.id) === Number(uid));
  return String(row?.label || '').trim() || `User ${uid}`;
};
const peerActivityShortLabel = (activityType) => {
  const t = String(activityType || '').toLowerCase();
  if (t === 'session') return 'Session';
  if (t === 'hold') return 'Hold';
  if (t === 'opening') return 'Open';
  if (t === 'school') return 'School';
  if (t === 'supervision') return 'Supv';
  if (t === 'team_meeting') return 'Meet';
  if (t === 'huddle') return 'Huddle';
  if (t === 'indirect') return 'Indirect';
  if (t === 'personal') return 'Personal';
  if (t === 'external') return 'Ext';
  if (t === 'office') return 'Office';
  return 'Busy';
};
const peerActivityShortFromBlock = (b) => {
  if (!b) return '';
  const raw = String(b.shortLabel || '').trim();
  if (raw) return raw;
  return peerActivityShortLabel(b.peerActivityType);
};
const peerTypedBlocksInCell = (uid, dayName, hour, ws, minute = 0) => {
  const peerSummary = peerBusySummariesByUserId.value?.[uid];
  if (!peerSummary) return [];
  const cellDate = addDaysYmd(ws, dayIdxFromWeekStartMonday(dayName));
  const pad = (n) => String(Number(n) || 0).padStart(2, '0');
  const cellStart = new Date(`${cellDate}T${pad(hour)}:${pad(minute)}:00`);
  const cellEndMin = Number(minute) + (showQuarterDetail.value ? 15 : 60);
  const endH = hour + Math.floor(cellEndMin / 60);
  const endM = cellEndMin % 60;
  const cellEnd = new Date(`${cellDate}T${pad(endH)}:${pad(endM)}:00`);
  const out = [];
  const pushIfOverlap = (row, defaults = {}) => {
    const st = new Date(String(row?.startAt || row?.start || '').includes('T')
      ? row.startAt || row.start
      : String(row?.startAt || row?.start || '').replace(' ', 'T'));
    const en = new Date(String(row?.endAt || row?.end || '').includes('T')
      ? row.endAt || row.end
      : String(row?.endAt || row?.end || '').replace(' ', 'T'));
    if (Number.isNaN(st.getTime()) || Number.isNaN(en.getTime())) return;
    if (!(en > cellStart && st < cellEnd)) return;
    out.push({ ...defaults, ...row, startAt: row.startAt || row.start, endAt: row.endAt || row.end });
  };
  const detail = String(peerSummary.detailLevel || peerBusyDetailLevel.value || '').toLowerCase();
  if (detail === 'full') {
    for (const row of peerSummary.officeEvents || []) {
      const slotState = String(row?.slotState || '').toUpperCase();
      let activityType = 'office';
      if (slotState === 'ASSIGNED_BOOKED') activityType = 'session';
      else if (slotState === 'ASSIGNED_TEMPORARY' || slotState === 'COMPANY_HOLD') activityType = 'hold';
      else if (slotState === 'ASSIGNED_AVAILABLE') activityType = 'opening';
      const building = String(row?.buildingName || '').trim();
      const roomNumber = String(row?.roomNumber || '').trim();
      const roomLabel = String(row?.roomLabel || '').trim();
      const officeLabel = [building, roomNumber ? `#${roomNumber}` : roomLabel].filter(Boolean).join(' ');
      pushIfOverlap(row, {
        activityType,
        title: activityType === 'session'
          ? (officeLabel ? `Session · ${officeLabel}` : 'Session')
          : activityType === 'opening'
            ? (officeLabel ? `Open · ${officeLabel}` : 'Open')
            : activityType === 'hold'
              ? (officeLabel ? `Hold · ${officeLabel}` : 'Hold')
              : (officeLabel || 'Office'),
        officeLabel,
        agencyId: Number(row?.agencyId || row?._agencyId || peerSummary.agencyId || 0) || null,
        source: 'office'
      });
    }
    for (const row of peerSummary.scheduleEvents || []) {
      if (row?.allDay) continue;
      const kind = String(row?.kind || '').toUpperCase();
      let activityType = 'event';
      let title = String(row?.title || '').trim() || 'Schedule event';
      if (kind === 'SCHEDULE_HOLD') { activityType = 'hold'; title = title || 'Schedule hold'; }
      else if (kind === 'INDIRECT_SERVICES') { activityType = 'indirect'; title = title || 'Indirect'; }
      else if (kind === 'TEAM_MEETING') { activityType = 'team_meeting'; title = title || 'Team meeting'; }
      else if (kind === 'HUDDLE') { activityType = 'huddle'; title = title || 'Huddle'; }
      else if (kind === 'PERSONAL_EVENT') {
        if (isClientSessionScheduleEvent(ev)) {
          activityType = 'session';
          title = title || 'Session';
        } else {
          activityType = 'personal';
          title = title || 'Personal';
        }
      }
      else if (/session|virtual/i.test(title)) { activityType = 'session'; }
      pushIfOverlap(row, {
        activityType,
        title,
        eventKind: kind,
        eventId: Number(row?.id || 0) || null,
        agencyId: Number(row?.agencyId || row?._agencyId || peerSummary.agencyId || 0) || null,
        source: 'meeting'
      });
    }
    for (const row of peerSummary.supervisionSessions || []) {
      pushIfOverlap(row, {
        activityType: 'supervision',
        title: String(row?.counterpartyName || '').trim()
          ? `Supervision · ${row.counterpartyName}`
          : 'Supervision',
        agencyId: Number(row?.agencyId || row?._agencyId || peerSummary.agencyId || 0) || null,
        source: 'meeting'
      });
    }
    for (const row of peerSummary.schoolAssignments || []) {
      // school rows often use dayOfWeek + times; fall back to busyBlocks if no timestamps
      if (row?.startAt || row?.start_at) {
        pushIfOverlap(row, {
          activityType: 'school',
          title: String(row?.schoolName || '').trim() || 'School',
          agencyId: Number(row?.agencyId || row?._agencyId || peerSummary.agencyId || 0) || null,
          source: 'school'
        });
      }
    }
  }
  if (!out.length) {
    for (const row of peerSummary.busyBlocks || []) {
      pushIfOverlap(row, {
        activityType: row?.activityType || 'busy',
        title: row?.title || 'Busy',
        agencyId: Number(row?.agencyId || peerSummary.agencyId || 0) || null
      });
    }
  }
  // Prefer more specific activity first for the primary chip
  const rank = (t) => ({
    session: 6, supervision: 5, team_meeting: 4, huddle: 4, school: 3, hold: 2, opening: 2, indirect: 1, personal: 1
  }[String(t || '').toLowerCase()] || 0);
  out.sort((a, b) => rank(b.activityType) - rank(a.activityType));
  return out;
};
const togglePeerBusyOverlay = () => {
  showPeerBusyOverlay.value = !showPeerBusyOverlay.value;
  if (showPeerBusyOverlay.value) {
    void loadPeerBusyCandidates();
    void loadPeerBusySummaries();
  }
};
const togglePeerBusyUser = (id) => {
  const uid = Number(id || 0);
  if (!uid) return;
  const cur = (peerBusySelectedIds.value || []).slice();
  const idx = cur.indexOf(uid);
  if (idx >= 0) cur.splice(idx, 1);
  else if (cur.length < maxPeerBusySelected) cur.push(uid);
  peerBusySelectedIds.value = cur;
};
const loadPeerBusyCandidates = async () => {
  const me = Number(authStore.user?.id || props.userId || 0);
  if (!me) return;
  try {
    peerBusyLoading.value = true;
    peerBusyError.value = '';
    const scopeIds = (effectiveAgencyIds.value || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    const params = scopeIds.length === 1
      ? { agencyId: scopeIds[0] }
      : { allAgencies: 'true' };
    const r = await api.get(`/users/${me}/meeting-candidates`, { params });
    const rows = Array.isArray(r?.data?.users) ? r.data.users : [];
    peerBusyCandidates.value = rows.map((u) => {
      const id = Number(u.id || 0);
      const first = String(u.firstName || u.first_name || '').trim();
      const last = String(u.lastName || u.last_name || '').trim();
      const email = String(u.email || '').trim();
      const agencyIds = parsePeerAgencyIds(u.agencyIds ?? u.agency_ids);
      return {
        id,
        email,
        role: String(u.role || '').trim().toLowerCase(),
        agencyIds,
        profilePhotoUrl: String(u.profilePhotoUrl || u.profile_photo_url || '').trim() || null,
        label: `${first} ${last}`.trim() || email || `User ${id}`
      };
    }).filter((u) => u.id > 0 && isPeerBusyCandidate(u));
    const allowed = new Set(peerBusyCandidates.value.map((p) => Number(p.id)));
    peerBusySelectedIds.value = (peerBusySelectedIds.value || []).filter((id) => allowed.has(Number(id)));
    const agencyIdsToHydrate = new Set();
    for (const p of peerBusyCandidates.value) {
      for (const aid of (p.agencyIds || [])) agencyIdsToHydrate.add(Number(aid));
    }
    for (const aid of agencyIdsToHydrate) {
      if (!aid) continue;
      void agencyStore.hydrateAgencyById?.(aid)?.then((full) => {
        const iconId = full?.icon_id ?? full?.iconId;
        if (iconId) void brandingStore.prefetchIconIds?.([iconId]);
      });
    }
  } catch (e) {
    peerBusyCandidates.value = [];
    peerBusySelectedIds.value = [];
    peerBusyError.value = e?.response?.data?.error?.message || e?.message || 'Failed to load coworkers';
  } finally {
    peerBusyLoading.value = false;
  }
};
const loadPeerBusySummaries = async () => {
  if (!showPeerBusyOverlay.value) return;
  const generation = peerBusyLoadGeneration.value + 1;
  peerBusyLoadGeneration.value = generation;
  const ids = (peerBusySelectedIds.value || []).map((n) => Number(n)).filter((n) => n > 0);
  const agencyIds = (effectiveAgencyIds.value || []).map((n) => Number(n)).filter((n) => n > 0);
  if (!ids.length || !agencyIds.length) {
    if (generation === peerBusyLoadGeneration.value) peerBusySummariesByUserId.value = {};
    return;
  }
  const ws = weekStart.value;
  const detailLevel = peerBusyDetailLevel.value;
  const next = {};
  await Promise.all(ids.map(async (uid) => {
    try {
      const perAgency = await Promise.all(
        agencyIds.map((agencyId) =>
          api.get(`/users/${uid}/schedule-summary`, {
            params: {
              agencyId,
              weekStart: ws,
              detailLevel,
              includeGoogleBusy: detailLevel === 'busy' ? 'true' : (showGoogleBusy.value ? 'true' : 'false'),
              includeGoogleEvents: 'false'
            }
          }).then((r) => r?.data || null).catch(() => null)
        )
      );
      const first = perAgency.find(Boolean);
      if (!first) return;
      const busyBlocks = [];
      const seen = new Set();
      const mergeList = (key) => {
        const out = [];
        const seenRow = new Set();
        for (const data of perAgency.filter(Boolean)) {
          for (const row of (data[key] || [])) {
            const k = `${row?.id || ''}|${row?.startAt || row?.start_at || ''}|${row?.endAt || row?.end_at || ''}|${row?.kind || row?.slotState || ''}`;
            if (seenRow.has(k)) continue;
            seenRow.add(k);
            out.push({ ...row, _agencyId: Number(row?.agencyId || row?._agencyId || data.agencyId || 0) || null });
          }
        }
        return out;
      };
      for (const data of perAgency.filter(Boolean)) {
        for (const b of (data.busyBlocks || [])) {
          const k = `${b.startAt}|${b.endAt}|${b.source || ''}|${b.activityType || ''}|${b.officeLabel || ''}`;
          if (seen.has(k)) continue;
          seen.add(k);
          busyBlocks.push({
            ...b,
            agencyId: Number(b.agencyId || data.agencyId || 0) || null
          });
        }
      }
      next[uid] = {
        ...first,
        busyBlocks,
        detailLevel,
        officeEvents: mergeList('officeEvents'),
        scheduleEvents: mergeList('scheduleEvents'),
        supervisionSessions: mergeList('supervisionSessions'),
        schoolAssignments: mergeList('schoolAssignments')
      };
    } catch {
      // skip failed peer
    }
  }));
  if (generation !== peerBusyLoadGeneration.value) return;
  peerBusySummariesByUserId.value = next;
};

const hideAllCalendars = () => {
  // Preserve the last visible configuration so "Show calendars" can restore it.
  lastCalendarPrefs.value = {
    showGoogleBusy: !!showGoogleBusy.value,
    showGoogleEvents: !!showGoogleEvents.value,
    showExternalBusy: !!showExternalBusy.value,
    selectedExternalCalendarIds: (selectedExternalCalendarIds.value || []).slice()
  };
  showGoogleBusy.value = false;
  showGoogleEvents.value = false;
  showExternalBusy.value = false;
  selectedExternalCalendarIds.value = [];
};

const showAllCalendars = () => {
  const p = lastCalendarPrefs.value;
  if (p) {
    showGoogleBusy.value = p.showGoogleBusy !== undefined ? !!p.showGoogleBusy : true;
    showGoogleEvents.value = p.showGoogleEvents !== undefined ? !!p.showGoogleEvents : false;
    normalizeGoogleOverlayMode('events');
    showExternalBusy.value = p.showExternalBusy !== undefined ? !!p.showExternalBusy : true;
    selectedExternalCalendarIds.value = coerceIdArray(p.selectedExternalCalendarIds);
    // If the restored selection is empty, default to ALL externals so "show" actually shows something.
    if (!selectedExternalCalendarIds.value.length && externalCalendarsAvailable.value.length) {
      selectAllExternalCalendars();
    }
    return;
  }
  // Fallback defaults.
  showGoogleBusy.value = true;
  showGoogleEvents.value = false;
  showExternalBusy.value = true;
  if (externalCalendarsAvailable.value.length) selectAllExternalCalendars();
};

const viewModeOptions = [
  { id: 'open_finder', label: 'My Schedule' },
  { id: 'office_layout', label: 'Office & Room Booking' }
];

// Office reminder: pulse + 3s toast when user lands on My Schedule (self mode)
const showOfficeReminderPulse = ref(false);
const officeReminderToast = ref('');
const OFFICE_REMINDER_MSG = 'Click "Office & Room Booking" to navigate offices and request space.';
const OFFICE_REMINDER_STORAGE_KEY = 'sched_office_reminder_seen';
const showOfficeReminder = () => {
  if (props.mode !== 'self') return;
  try {
    if (sessionStorage.getItem(OFFICE_REMINDER_STORAGE_KEY)) return;
    sessionStorage.setItem(OFFICE_REMINDER_STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
  showOfficeReminderPulse.value = true;
  officeReminderToast.value = OFFICE_REMINDER_MSG;
  setTimeout(() => {
    officeReminderToast.value = '';
    setTimeout(() => { showOfficeReminderPulse.value = false; }, 400);
  }, 3000);
};

/** Primary CTA: open office/room request (keeps slide toggle for navigation). */
const openQuickOfficeRoomRequest = async () => {
  if (props.hideOfficeAndCalendarIntegration) return;
  if (!canBookFromGrid.value) {
    window.alert('You do not have permission to request office space on this schedule.');
    return;
  }
  viewMode.value = 'office_layout';
  await nextTick();
  if (!isOfficeScopeSpecific.value) {
    const specific = resolveSpecificOfficeId();
    if (specific) selectedOfficeLocationId.value = specific;
  }
  if (!isOfficeScopeSpecific.value) {
    officeReminderToast.value = 'Choose a specific office from the Office dropdown, then tap Request again or pick a time on the board.';
    setTimeout(() => { officeReminderToast.value = ''; }, 6000);
    return;
  }
  const ymd = String(todayLocalYmd.value || weekStart.value || '').slice(0, 10);
  const dayName = dayNameForDateYmd(ymd) || 'Monday';
  const nowHour = new Date().getHours();
  const hour = Math.max(7, Math.min(20, Number.isFinite(nowHour) ? nowHour : 9));
  openSlotActionModal({
    dayName,
    hour,
    dateYmd: ymd,
    preserveSelectionRange: false,
    initialRequestType: 'office_request_only',
    actionSource: 'quick_office_cta'
  });
};

/**
 * Dashboard overview "Book" / "Book virtual" deep-link:
 * open today's slot action modal on the personal schedule (existing booking flow).
 */
const openQuickBook = async ({ virtual = false } = {}) => {
  if (!canBookFromGrid.value) {
    officeReminderToast.value = 'Open a time on the schedule to book.';
    setTimeout(() => { officeReminderToast.value = ''; }, 5000);
    return;
  }
  // Prefer personal calendar so clinical session booking is available without office layout.
  if (viewMode.value === 'office_layout') {
    viewMode.value = 'open_finder';
    await nextTick();
  }
  const ymd = String(todayLocalYmd.value || weekStart.value || '').slice(0, 10);
  const dayName = dayNameForDateYmd(ymd) || 'Monday';
  const nowHour = new Date().getHours();
  const hour = Math.max(7, Math.min(20, Number.isFinite(nowHour) ? nowHour : 9));
  const flags = effectiveAgencyFeatureFlags.value || {};
  const hasClinicalOrLearning = !!(flags.hasClinicalOrg || flags.hasLearningOrg);
  const hasOffice = isOfficeScopeSpecific.value || isOfficeScopeAll.value;
  let initialRequestType = '';
  if (virtual) {
    // Virtual session is always Individual session + Telehealth (office optional).
    initialRequestType = 'individual_session';
  } else if (hasClinicalOrLearning && hasOffice) {
    initialRequestType = 'individual_session';
  } else if (!props.hideOfficeAndCalendarIntegration && hasOffice) {
    initialRequestType = 'office_request_only';
  } else {
    initialRequestType = 'individual_session';
  }
  openSlotActionModal({
    dayName,
    hour,
    dateYmd: ymd,
    preserveSelectionRange: false,
    initialRequestType,
    initialModality: virtual ? 'TELEHEALTH' : (hasOffice ? '' : 'TELEHEALTH'),
    actionSource: virtual ? 'overview_book_virtual' : 'overview_book'
  });
  if (virtual) {
    officeReminderToast.value = hasOffice
      ? 'Virtual session selected — confirm time and submit (office is optional for telehealth).'
      : 'Virtual session selected — no office required. Confirm time and submit.';
    setTimeout(() => { officeReminderToast.value = ''; }, 5500);
  } else if (!hasOffice && !props.hideOfficeAndCalendarIntegration) {
    officeReminderToast.value = 'Choose Virtual for an office-free session, or pick an office for in-person.';
    setTimeout(() => { officeReminderToast.value = ''; }, 6000);
  } else {
    officeReminderToast.value = 'Adjust the time if needed, then choose a booking type.';
    setTimeout(() => { officeReminderToast.value = ''; }, 4500);
  }
};

const clearScheduleActionQuery = () => {
  if (!route.query?.scheduleAction) return;
  const nextQuery = { ...route.query };
  delete nextQuery.scheduleAction;
  router.replace({ query: nextQuery }).catch(() => {});
};

const waitForScheduleReady = async (timeoutMs = 4500) => {
  await nextTick();
  // Deferred load may not have flipped `loading` yet — give it a beat.
  if (!loading.value) {
    await new Promise((r) => setTimeout(r, 80));
  }
  if (!loading.value && (officeLocations.value || []).length) return;
  if (!loading.value) {
    // Wait for load to start, then finish (or timeout).
    await new Promise((resolve) => {
      let stopLoading = null;
      const finish = () => {
        stopBoot?.();
        stopLoading?.();
        resolve();
      };
      const stopBoot = watch(loading, (isLoading) => {
        if (!isLoading) return;
        stopBoot();
        stopLoading = watch(loading, (still) => {
          if (!still) finish();
        });
      });
      setTimeout(finish, timeoutMs);
    });
    return;
  }
  await new Promise((resolve) => {
    const stop = watch(loading, (isLoading) => {
      if (!isLoading) {
        stop();
        resolve();
      }
    });
    setTimeout(() => {
      stop();
      resolve();
    }, timeoutMs);
  });
};

const consumeScheduleActionQuery = async () => {
  const action = String(route.query?.scheduleAction || '').trim().toLowerCase();
  if (!action || (action !== 'book' && action !== 'book_virtual')) return;
  clearScheduleActionQuery();
  // Wait for schedule/office locations so session booking can preselect an office when possible.
  await waitForScheduleReady();
  await openQuickBook({ virtual: action === 'book_virtual' });
};

const loadSelfScheduleAgencies = async () => {
  if (props.mode !== 'self') {
    selfScheduleAgencyOptions.value = [];
    selfScheduleAgenciesLoaded.value = true;
    return;
  }
  try {
    const resp = await api.get('/users/me/agencies');
    const rows = Array.isArray(resp?.data) ? resp.data : [];
    const deduped = [];
    const seen = new Set();
    for (const row of rows) {
      const id = Number(row?.id || 0);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      deduped.push({
        id,
        name: String(row?.name || row?.agency_name || `Agency ${id}`).trim(),
        organization_type: row?.organization_type || row?.organizationType || 'agency',
        hasClinicalOrg: !!row?.hasClinicalOrg,
        hasLearningOrg: !!row?.hasLearningOrg,
        medicalBillingEnabled: isMedicalBillingEnabled(row?.feature_flags || row?.featureFlags),
        featureFlags: row?.feature_flags || row?.featureFlags || null
      });
    }
    // Always include the currently selected tenant (superadmin may be scoping a non-membership org).
    const current = agencyStore.currentAgency;
    const currentId = Number(current?.id || 0);
    if (currentId && !seen.has(currentId) && isTenantOrganizationType(current?.organization_type || current?.organizationType)) {
      deduped.push({
        id: currentId,
        name: String(current?.name || `Agency ${currentId}`).trim(),
        organization_type: current?.organization_type || current?.organizationType || 'agency',
        hasClinicalOrg: !!current?.hasClinicalOrg,
        hasLearningOrg: !!current?.hasLearningOrg,
        medicalBillingEnabled: isMedicalBillingEnabled(current?.feature_flags),
        featureFlags: current?.feature_flags || null
      });
      seen.add(currentId);
    }
    selfScheduleAgencyOptions.value = deduped;
    for (const row of deduped) {
      void agencyStore.hydrateAgencyById?.(row.id)?.then((full) => {
        const iconId = full?.icon_id ?? full?.iconId;
        if (iconId) void brandingStore.prefetchIconIds?.([iconId]);
      });
    }
    // Superadmin: load org catalog so the booking tenant picker isn't stuck on one membership.
    const role = String(authStore.user?.role || '').toLowerCase();
    if ((role === 'super_admin' || role === 'superadmin') && !(agencyStore.agencies || []).length) {
      try {
        await agencyStore.fetchAgencies();
      } catch {
        // best-effort
      }
    }
  } catch {
    selfScheduleAgencyOptions.value = [];
  } finally {
    selfScheduleAgenciesLoaded.value = true;
  }
};

// Load persisted overlay prefs once (provider view only).
let hadSavedOverlayPrefs = false;
try {
  if (props.mode === 'self') {
    const saved = loadOverlayPrefs();
    if (saved) {
      hadSavedOverlayPrefs = true;
      showGoogleBusy.value = saved.showGoogleBusy !== undefined ? !!saved.showGoogleBusy : true;
      showGoogleEvents.value = saved.showGoogleEvents !== undefined ? !!saved.showGoogleEvents : false;
      normalizeGoogleOverlayMode('events');
      showExternalBusy.value = saved.showExternalBusy !== undefined ? !!saved.showExternalBusy : true;
      showOfficeOverlay.value = saved.showOfficeOverlay !== undefined ? !!saved.showOfficeOverlay : true;
      hideExternalIcsTitles.value = !!saved.hideExternalIcsTitles;
      selectedExternalCalendarIds.value = coerceIdArray(saved.selectedExternalCalendarIds);
      const dedicatedHideWeekend = loadHideWeekendPref();
      hideWeekend.value = dedicatedHideWeekend !== null
        ? dedicatedHideWeekend
        : (saved.hideWeekend !== undefined ? !!saved.hideWeekend : true);
      const dedicatedShowAllHours = loadShowAllHoursPref();
      showAllHours.value = dedicatedShowAllHours !== null
        ? dedicatedShowAllHours
        : !!saved.showAllHours;
      viewMode.value = saved.viewMode === 'office_layout' ? 'office_layout' : 'open_finder';
      lastCalendarPrefs.value = saved.lastCalendarPrefs ? { ...saved.lastCalendarPrefs } : null;
      // If saved selection is empty, we do NOT auto-select all — user explicitly hid calendars.
      shouldDefaultSelectAllExternal.value = false;
    } else {
      // First-load defaults (select-all external happens once calendars list is known).
      showGoogleBusy.value = true;
      showGoogleEvents.value = false;
      showExternalBusy.value = true;
      showOfficeOverlay.value = true;
      const dedicatedHideWeekend = loadHideWeekendPref();
      hideWeekend.value = dedicatedHideWeekend !== null ? dedicatedHideWeekend : true;
      const dedicatedShowAllHours = loadShowAllHoursPref();
      showAllHours.value = dedicatedShowAllHours !== null ? dedicatedShowAllHours : false;
      shouldDefaultSelectAllExternal.value = true;
    }
  }
} finally {
  overlayPrefsLoaded.value = true;
}

// When no saved overlay prefs, apply schedule_default_view from user preferences.
onMounted(() => {
  if (props.mode === 'self' && !hadSavedOverlayPrefs) {
    try {
      const prefsStore = useUserPreferencesStore();
      const preferred = prefsStore.scheduleDefaultView;
      if (preferred === 'office_layout' || preferred === 'open_finder') {
        viewMode.value = preferred;
      }
    } catch {
      /* ignore */
    }
  }
  void loadSelfScheduleAgencies();
  try {
    narrowScheduleMql = window.matchMedia('(max-width: 820px)');
    narrowScheduleHandler = () => {
      const narrow = !!narrowScheduleMql?.matches;
      const wasNarrow = isNarrowSchedule.value;
      isNarrowSchedule.value = narrow;
      // Only auto day-focus when entering the narrow breakpoint (not when user chose Week).
      if (narrow && !wasNarrow) {
        setScheduleSpanMode('day');
      }
    };
    narrowScheduleHandler();
    if (narrowScheduleMql?.addEventListener) narrowScheduleMql.addEventListener('change', narrowScheduleHandler);
    else if (narrowScheduleMql?.addListener) narrowScheduleMql.addListener(narrowScheduleHandler);
  } catch {
    isNarrowSchedule.value = false;
  }
  const handleMouseUp = () => {
    const wasDragging = isCellDragSelecting.value;
    // Preserve anchor across nextTick — mouseup clears drag state before auto-open runs.
    const preservedAnchorKey = String(dragAnchorSlot.value?.key || mouseDownCellKey.value || lastSelectedActionKey.value || '');
    isCellDragSelecting.value = false;
    dragAnchorSlot.value = null;
    mouseDownCellKey.value = '';
    if (wasDragging) {
      // Keep suppress true so the trailing click does not overwrite the multi-hour selection.
      suppressClickAfterDrag.value = true;
      nextTick(() => maybeAutoOpenSelectionActions({ preferredFirstKey: preservedAnchorKey }));
    }
  };
  window.addEventListener('mouseup', handleMouseUp);
  schedMouseUpHandler = handleMouseUp;
  joinPromptNowMs.value = Date.now();
  joinPromptTimer = setInterval(() => {
    joinPromptNowMs.value = Date.now();
  }, 30000);
  // Deep-link from dashboard overview Book / Book virtual CTAs.
  void consumeScheduleActionQuery();
  if (typeof document !== 'undefined') {
    darkThemeObserver = new MutationObserver(() => {
      isDocumentDark.value = document.documentElement.getAttribute('data-theme') === 'dark';
    });
    darkThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
});

watch(
  () => String(route.query?.scheduleAction || ''),
  (action) => {
    const a = String(action || '').trim().toLowerCase();
    if (a === 'book' || a === 'book_virtual') {
      void consumeScheduleActionQuery();
    }
  }
);

onUnmounted(() => {
  clearSupvMeetPolling();
  clearGevtClickTimer();
  clearDeferredLoad();
  if (joinPromptTimer) {
    clearInterval(joinPromptTimer);
    joinPromptTimer = null;
  }
  try {
    if (narrowScheduleMql && narrowScheduleHandler) {
      if (narrowScheduleMql.removeEventListener) narrowScheduleMql.removeEventListener('change', narrowScheduleHandler);
      else if (narrowScheduleMql.removeListener) narrowScheduleMql.removeListener(narrowScheduleHandler);
    }
  } catch { /* ignore */ }
  narrowScheduleMql = null;
  narrowScheduleHandler = null;
  if (schedMouseUpHandler) {
    window.removeEventListener('mouseup', schedMouseUpHandler);
    schedMouseUpHandler = null;
  }
  darkThemeObserver?.disconnect();
  darkThemeObserver = null;
});

const focusableDays = computed(() => {
  if (hideWeekend.value) return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  return orderedDays.value.slice();
});
const focusedDaySet = computed(() => new Set((focusedDays.value || []).map((d) => String(d))));
const visibleDays = computed(() => {
  const baseDays = focusableDays.value;
  const selected = (focusedDays.value || []).filter((d) => baseDays.includes(String(d)));
  return selected.length ? selected : baseDays;
});
const displayTimeSlots = computed(() => {
  const hList = hours.value || [];
  if (!showQuarterDetail.value) {
    return hList.map((h) => ({
      key: `${h}:00`,
      hour: Number(h),
      minute: 0,
      label: hourLabel(h)
    }));
  }
  const slots = [];
  for (const h of hList) {
    for (const m of quarterMinuteOptions) {
      slots.push({
        key: `${h}:${pad2(m)}`,
        hour: Number(h),
        minute: Number(m),
        label: hourMinuteLabel(h, m)
      });
    }
  }
  return slots;
});

const gridStyle = computed(() => {
  const cols = visibleDays.value.length;
  const dayMin = 120;
  const timeCol = 90;
  return {
    gridTemplateColumns: `${timeCol}px repeat(${cols}, minmax(${dayMin}px, 1fr))`,
    minWidth: `${timeCol + cols * dayMin}px`
  };
});

const toggleFocusedDay = (dayName, evt = null) => {
  const day = String(dayName || '');
  if (!day || !focusableDays.value.includes(day)) return;
  const multi = !!(evt?.metaKey || evt?.ctrlKey || evt?.shiftKey);
  const current = new Set((focusedDays.value || []).map((d) => String(d)).filter((d) => focusableDays.value.includes(d)));
  if (multi) {
    if (current.has(day)) current.delete(day);
    else current.add(day);
    focusedDays.value = Array.from(current.values());
    return;
  }
  if (current.size === 1 && current.has(day)) {
    focusedDays.value = [];
    return;
  }
  focusedDays.value = [day];
};

const clearFocusedDays = () => {
  focusedDays.value = [];
};

watch(focusableDays, (days) => {
  const allowed = new Set((Array.isArray(days) ? days : []).map((d) => String(d)));
  focusedDays.value = (focusedDays.value || []).map((d) => String(d)).filter((d) => allowed.has(d));
});

const externalCalendarsAvailable = computed(() => {
  const s = summary.value;
  const arr = Array.isArray(s?.externalCalendarsAvailable) ? s.externalCalendarsAvailable : [];
  return arr
    .map((c) => ({ id: Number(c?.id || 0), label: String(c?.label || '').trim() }))
    .filter((c) => Number.isFinite(c.id) && c.id > 0 && c.label);
});

const pad2 = (n) => String(n).padStart(2, '0');

const localYmd = (d) => {
  const yy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yy}-${mm}-${dd}`;
};

const todayLocalYmd = computed(() => localYmd(new Date()));
const todayMmdd = computed(() => {
  const d = new Date();
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
});

const toLocalDateNoon = (dateLike) => {
  // IMPORTANT: `new Date('YYYY-MM-DD')` parses as UTC and can shift the local day.
  // Use local noon for YMD strings to avoid off-by-one-day/week bugs.
  const s = typeof dateLike === 'string' ? dateLike.trim() : '';
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00`);
  return new Date(dateLike || Date.now());
};

const hourLabel = (h) => {
  const d = new Date();
  d.setHours(Number(h), 0, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric' });
};
const hourMinuteLabel = (h, m = 0) => {
  const d = new Date();
  d.setHours(Number(h), Number(m), 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const startOfWeekMondayYmd = (dateLike) => {
  const d = toLocalDateNoon(dateLike);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return localYmd(d);
};

const addDaysYmd = (ymd, daysToAdd) => {
  const d = toLocalDateNoon(String(ymd).slice(0, 10));
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + Number(daysToAdd || 0));
  return localYmd(d);
};

const addMonthsYmd = (ymd, monthsToAdd) => {
  const d = toLocalDateNoon(String(ymd).slice(0, 10));
  d.setHours(0, 0, 0, 0);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + Number(monthsToAdd || 0));
  const month = d.getMonth();
  d.setDate(day);
  if (d.getMonth() !== month) d.setDate(0);
  return localYmd(d);
};

const weekdayFromYmd = (ymd) => {
  const d = toLocalDateNoon(String(ymd || '').slice(0, 10));
  if (Number.isNaN(d.getTime())) return null;
  return d.getDay(); // 0=Sun..6=Sat
};

const dayDateLabel = (dayName) => {
  if (ALL_DAYS.indexOf(String(dayName || '')) < 0) return '';
  const dayIdx = dayIdxFromWeekStartMonday(dayName);
  const ymd = addDaysYmd(weekStart.value, dayIdx);
  // Use noon to avoid DST edge-cases around midnight.
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const weekStart = ref(startOfWeekMondayYmd(props.weekStartYmd || new Date()));

const isTodayDay = (dayName) => {
  if (ALL_DAYS.indexOf(String(dayName || '')) < 0) return false;
  const ymd = addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dayName));
  return ymd === todayLocalYmd.value;
};

const dayNameForDateYmd = (dateYmd) => {
  const g = officeGrid.value;
  const d = String(dateYmd || '').slice(0, 10);
  if (g && Array.isArray(g.days)) {
    const idx = g.days.findIndex((x) => String(x || '').slice(0, 10) === d);
    if (idx >= 0) return ALL_DAYS[idx] || null;
  }
  // Fallback: compute from the visible weekStart (Monday-first grid).
  const ws = String(weekStart.value || '').slice(0, 10);
  const [y1, m1, d1] = ws.split('-').map(Number);
  const [y2, m2, d2] = d.split('-').map(Number);
  const a = new Date(y1, (m1 || 1) - 1, d1 || 1);
  const b = new Date(y2, (m2 || 1) - 1, d2 || 1);
  const diff = Math.floor((b - a) / (1000 * 60 * 60 * 24));
  return ALL_DAYS[diff] ?? null;
};

const onOfficeLayoutCellClick = ({ dateYmd, hour, roomId, slot, event, alreadyRequested }) => {
  const st = String(slot?.state || slot?.slotState || '').toLowerCase();
  const pending = Number(slot?.pendingRequestCount || 0) > 0 || alreadyRequested === true;
  if (pending && st === 'open') {
    const names = Array.isArray(slot?.pendingRequestNames) ? slot.pendingRequestNames.filter(Boolean) : [];
    const roomName = String(slot?.roomLabel || slot?.room_label || `Room ${roomId}`).trim();
    slotInfoModalData.value = {
      roomLabel: roomName,
      providerLabel: names.length ? names.join(', ') : '—',
      state: 'requested',
      statusLabel: 'Already requested (pending approval)',
      slot,
    };
    showSlotInfoModal.value = true;
    return;
  }
  // If a non-admin without office management rights clicks someone else's booked slot → read-only info.
  if (!isAdminMode.value && !canManageOffices.value) {
    const currentUserId = Number(authStore.user?.id || 0);
    const isOtherPersonsBooked = st === 'assigned_booked' && currentUserId > 0
      && Number(slot?.bookedProviderId || slot?.assignedProviderId || 0) !== currentUserId;
    if (isOtherPersonsBooked) {
      const roomName = String(slot?.roomLabel || slot?.room_label || `Room ${roomId}`).trim();
      const providerName = String(slot?.bookedProviderFullName || slot?.bookedProviderName || slot?.assignedProviderFullName || slot?.assignedProviderName || slot?.providerInitials || '').trim() || '—';
      slotInfoModalData.value = {
        roomLabel: roomName,
        providerLabel: providerName,
        state: st,
        statusLabel: 'Booked',
        slot,
      };
      showSlotInfoModal.value = true;
      return;
    }
  }
  if (!canBookFromGrid.value) return;
  const dn = dayNameForDateYmd(dateYmd);
  if (!dn) return;
  onCellClick(dn, Number(hour), event, { dateYmd, roomId, slot });
};

/** Look up the weekly-grid slot for an office-layout cell (may be null for truly empty). */
const lookupOfficeGridSlot = (dateYmd, hour, roomId) => {
  const slots = Array.isArray(officeGrid.value?.slots) ? officeGrid.value.slots : [];
  const ymd = String(dateYmd || '').slice(0, 10);
  const h = Number(hour);
  const rid = Number(roomId || 0);
  return slots.find((s) =>
    String(s?.date || s?.dateYmd || '').slice(0, 10) === ymd
    && Number(s?.hour) === h
    && Number(s?.roomId || s?.room_id || 0) === rid
  ) || null;
};

const officeLayoutSelectionItem = (dateYmd, hour, roomId, slot = null) => {
  const ymd = String(dateYmd || '').slice(0, 10);
  const rid = Number(roomId || 0);
  const h = Number(hour);
  const resolved = slot || lookupOfficeGridSlot(ymd, h, rid);
  return {
    key: `${ymd}|${h}|${rid}`,
    dateYmd: ymd,
    dayName: String(dayNameForDateYmd(ymd) || ''),
    hour: h,
    roomId: rid,
    slot: resolved
  };
};

const enrichOfficeSelectionItem = (item) => {
  if (!item) return item;
  if (item.slot) return item;
  if (viewMode.value !== 'office_layout') return item;
  const slot = lookupOfficeGridSlot(item.dateYmd, item.hour, item.roomId);
  return slot ? { ...item, slot } : item;
};

/** open = requestable blank cell; occupied = any assignment/booking/hold. */
const officeSelectionOccupancy = (item) => {
  const slot = item?.slot || null;
  const st = String(slot?.state || slot?.slotState || slot?.slot_state || '').trim().toLowerCase();
  if (!st || st === 'open') return 'open';
  return 'occupied';
};

/**
 * Logical booking identity for contiguous hourly events: same room/day/provider.
 * Architecture remains one event per hour; UX treats a multi-hour span as one booking when identity matches.
 */
const officeLogicalBookingKey = (item) => {
  const slot = item?.slot || null;
  const st = String(slot?.state || slot?.slotState || slot?.slot_state || '').trim().toLowerCase();
  const providerId = Number(
    slot?.bookedProviderId
    || slot?.booked_provider_id
    || slot?.assignedProviderId
    || slot?.assigned_provider_id
    || 0
  );
  const providerName = String(
    slot?.bookedProviderName
    || slot?.bookedProviderFullName
    || slot?.assignedProviderName
    || slot?.assignedProviderFullName
    || ''
  ).trim().toLowerCase();
  const roomId = Number(item?.roomId || slot?.roomId || 0);
  const dateYmd = String(item?.dateYmd || '').slice(0, 10);
  if (st === 'company_hold') return `hold|${dateYmd}|${roomId}`;
  // Same person + room + day = one logical booking (even across hourly event rows).
  if (providerId > 0) return `p${providerId}|${dateYmd}|${roomId}`;
  if (providerName) return `n:${providerName}|${dateYmd}|${roomId}`;
  const standingId = Number(slot?.standingAssignmentId || 0);
  if (standingId > 0) return `s${standingId}|${dateYmd}|${roomId}`;
  const eventId = Number(slot?.eventId || slot?.officeEventId || 0);
  if (eventId > 0) return `e${eventId}|${dateYmd}|${roomId}`;
  return `unknown|${dateYmd}|${roomId}|${item?.hour || 0}`;
};

const isSameOfficeLogicalBooking = (a, b) => {
  if (!a || !b) return false;
  return officeLogicalBookingKey(a) === officeLogicalBookingKey(b);
};

/** Prefer the drag/click anchor as "first selected"; fall back to chronological order. */
const firstSelectedOfficeItem = (rows, preferredFirstKey = '') => {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return null;
  const anchorKey = String(
    preferredFirstKey
    || dragAnchorSlot.value?.key
    || mouseDownCellKey.value
    || lastSelectedActionKey.value
    || ''
  );
  if (anchorKey) {
    const hit = list.find((r) => String(r?.key || '') === anchorKey);
    if (hit) return hit;
  }
  return list[0];
};

const openOfficeOccupiedSelectionModal = (focusItem, bookingRows) => {
  const focus = enrichOfficeSelectionItem(focusItem);
  const rows = (Array.isArray(bookingRows) && bookingRows.length ? bookingRows : [focus])
    .map(enrichOfficeSelectionItem);
  selectedActionSlots.value = rows;
  lastSelectedActionKey.value = String(focus?.key || rows[0]?.key || '');
  openSlotActionModal({
    dayName: focus.dayName,
    hour: focus.hour,
    roomId: focus.roomId,
    dateYmd: focus.dateYmd,
    slot: focus.slot,
    preserveSelectionRange: rows.length > 1,
    // Chooser-first — do not auto-select slot_details / a form action.
    initialRequestType: '',
    actionSource: 'office_block'
  });
};

const resolveOfficeMultiSelectionActions = (rawRows, preferredFirstKey = '') => {
  const rows = (Array.isArray(rawRows) ? rawRows : []).map(enrichOfficeSelectionItem);
  if (rows.length <= 1) return false;

  const openRows = rows.filter((r) => officeSelectionOccupancy(r) === 'open');
  const occupiedRows = rows.filter((r) => officeSelectionOccupancy(r) === 'occupied');

  // Mixed open + booked/assigned → keep only open slots (assign/request flow).
  if (openRows.length && occupiedRows.length) {
    selectedActionSlots.value = openRows;
    lastSelectedActionKey.value = String(openRows[0]?.key || '');
    lastAutoOpenedSelectionSignature.value = selectedActionSignature(openRows);
    openSlotActionModal({
      ...openRows[0],
      preserveSelectionRange: openRows.length > 1,
      actionSource: 'plus_or_blank'
    });
    return true;
  }

  // All open → assign / request.
  if (openRows.length && !occupiedRows.length) {
    openSlotActionModal({
      ...openRows[0],
      preserveSelectionRange: openRows.length > 1,
      actionSource: 'plus_or_blank'
    });
    return true;
  }

  // All occupied: same contiguous booking → open that booking; else open the first selected booking only.
  if (occupiedRows.length) {
    const first = firstSelectedOfficeItem(occupiedRows, preferredFirstKey);
    const sameAsFirst = occupiedRows.filter((r) => isSameOfficeLogicalBooking(first, r));
    const allSameBooking = occupiedRows.every((r) => isSameOfficeLogicalBooking(occupiedRows[0], r));
    const bookingRows = allSameBooking ? occupiedRows : sameAsFirst;
    openOfficeOccupiedSelectionModal(first, bookingRows.length ? bookingRows : [first]);
    return true;
  }

  return false;
};

const onOfficeLayoutCellMouseDown = ({ dateYmd, hour, roomId, event }) => {
  if (!canBookFromGrid.value) return;
  if (Number(event?.button) !== 0) return;
  mouseDownClient.value = { x: event?.clientX ?? 0, y: event?.clientY ?? 0 };
  const item = officeLayoutSelectionItem(dateYmd, hour, roomId);
  isCellDragSelecting.value = false;
  dragAnchorSlot.value = item;
  mouseDownCellKey.value = item.key;
  suppressClickAfterDrag.value = false;
};

const onOfficeLayoutCellMouseEnter = ({ dateYmd, hour, roomId, event }) => {
  if (!dragAnchorSlot.value) return;
  if (Number(event?.buttons || 0) !== 1) return;
  // Multi-hour drag stays within a single room column.
  if (Number(dragAnchorSlot.value.roomId || 0) !== Number(roomId || 0)) return;
  const dx = (event?.clientX ?? 0) - mouseDownClient.value.x;
  const dy = (event?.clientY ?? 0) - mouseDownClient.value.y;
  if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
  const current = officeLayoutSelectionItem(dateYmd, hour, roomId);
  if (current.key === dragAnchorSlot.value.key) return;
  if (!isCellDragSelecting.value) {
    isCellDragSelecting.value = true;
    selectedActionSlots.value = [dragAnchorSlot.value];
    lastSelectedActionKey.value = dragAnchorSlot.value.key;
  }
  selectedActionSlots.value = [dragAnchorSlot.value];
  lastSelectedActionKey.value = dragAnchorSlot.value.key;
  applyShiftSelection(current);
  suppressClickAfterDrag.value = true;
};

const propAgencyId = computed(() => {
  const n = Number(props.agencyId || 0);
  return Number.isFinite(n) && n > 0 ? n : null;
});

const propAgencyIds = computed(() => {
  const fromList = Array.isArray(props.agencyIds) ? props.agencyIds : null;
  const ids = (fromList && fromList.length ? fromList : (propAgencyId.value ? [propAgencyId.value] : []))
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
  // De-dupe while preserving order
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
});

const selfScheduleAgencyOptions = ref([]);
const activeScheduleAgencyIds = ref([]);
const selectedActionAgencyId = ref(0);
const selfScheduleAgenciesLoaded = ref(false);

const isAdminMode = computed(() => props.mode === 'admin');

/** Resolve display name from Pinia (user + global agency lists, current org). */
const agencyNameFromStore = (agencyId) => {
  const id = Number(agencyId || 0);
  if (!id) return '';
  const lists = [
    agencyStore.userAgencies,
    agencyStore.agencies,
    agencyStore.currentAgency ? [agencyStore.currentAgency] : []
  ];
  for (const list of lists) {
    const arr = Array.isArray(list) ? list : [];
    const row = arr.find((a) => Number(a?.id || 0) === id);
    if (row) {
      const n = String(row?.name ?? row?.agency_name ?? row?.title ?? '').trim();
      if (n) return n;
    }
  }
  return '';
};

const agencyLabel = (agencyId) => {
  const id = Number(agencyId || 0);
  if (!id) return '';
  const local = (selfScheduleAgencyOptions.value || []).find((row) => Number(row?.id || 0) === id);
  if (local?.name) return String(local.name);
  const map = props.agencyLabelById && typeof props.agencyLabelById === 'object' ? props.agencyLabelById : null;
  const fromProp = map ? String(map[String(id)] || map[id] || '').trim() : '';
  if (fromProp) return fromProp;
  const fromStore = agencyNameFromStore(id);
  if (fromStore) return fromStore;
  return '';
};

const isTenantOrganizationType = (raw) => {
  if (raw && typeof raw === 'object') return isTenantOrganizationTypeShared(raw);
  // Empty/legacy rows are treated as agency tenants
  const t = String(raw || 'agency').trim().toLowerCase();
  if (!t) return true;
  return isTenantOrganizationTypeShared(t);
};

const mapAgencyOption = (row) => {
  if (!row) return null;
  const id = Number(row.id || row.agency_id || 0);
  if (!id) return null;
  const flags = row.feature_flags || row.featureFlags || row.featureFlagsParsed || null;
  const organizationType = String(row.organization_type || row.organizationType || 'agency').trim().toLowerCase() || 'agency';
  return {
    id,
    label: String(row.name || row.agency_name || row.label || `Agency ${id}`).trim() || `Agency ${id}`,
    organizationType,
    hasClinicalOrg: row.hasClinicalOrg == null ? null : !!row.hasClinicalOrg,
    hasLearningOrg: row.hasLearningOrg == null ? null : !!row.hasLearningOrg,
    medicalBillingEnabled: !!row.medicalBillingEnabled || isMedicalBillingEnabled(flags)
  };
};

const agencyFilterOptions = computed(() => {
  if (props.mode === 'self' && (selfScheduleAgencyOptions.value || []).length) {
    return selfScheduleAgencyOptions.value
      .map((row) => mapAgencyOption(row))
      .filter(Boolean);
  }
  return propAgencyIds.value.map((id) => {
    const fromStore = (agencyStore.userAgencies || []).find((a) => Number(a?.id) === Number(id))
      || (agencyStore.agencies || []).find((a) => Number(a?.id) === Number(id))
      || (Number(agencyStore.currentAgency?.id) === Number(id) ? agencyStore.currentAgency : null);
    return mapAgencyOption(fromStore || { id, name: agencyLabel(id) || `Agency ${id}` });
  }).filter(Boolean);
});

/** Billable tenants only (agency / life_coach / consultant) — not schools, programs, clubs. */
const bookingAgencyOptions = computed(() => {
  const byId = new Map();
  const add = (row) => {
    const opt = mapAgencyOption(row);
    if (!opt) return;
    if (!isTenantOrganizationType(opt.organizationType)) return;
    const prev = byId.get(opt.id);
    byId.set(opt.id, prev ? { ...prev, ...opt, label: opt.label || prev.label } : opt);
  };
  for (const row of agencyFilterOptions.value || []) add(row);
  for (const row of selfScheduleAgencyOptions.value || []) add(row);
  for (const row of agencyStore.userAgencies || []) add(row);
  if (agencyStore.currentAgency) add(agencyStore.currentAgency);
  const role = String(authStore.user?.role || '').toLowerCase();
  if (role === 'super_admin' || role === 'superadmin') {
    for (const row of agencyStore.agencies || []) add(row);
  }
  return Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label));
});

/** Actions tied to a specific office/room — agency list must be office-affiliated tenants only. */
const OFFICE_AGENCY_SCOPED_ACTIONS = new Set([
  'admin_assign',
  'office_request_only',
  'office',
  'forfeit_slot',
  'unbook_slot',
  'cancel_booking',
  'extend_assignment',
  'intake_virtual_on',
  'intake_inperson_on',
  'intake_virtual_off',
  'intake_inperson_off'
]);

const showClinicalBookingFields = computed(() => {
  const effId = Number(effectiveAgencyId.value || 0);
  if (!effId) return false;
  const opt = (bookingAgencyOptions.value || []).find((r) => Number(r?.id) === effId)
    || (agencyFilterOptions.value || []).find((r) => Number(r?.id) === effId);
  if (opt?.medicalBillingEnabled === true) return true;
  if (opt?.hasClinicalOrg === true) return true;
  if (Number(agencyStore.currentAgency?.id) === effId) {
    if (isMedicalBillingEnabled(agencyStore.currentAgency?.feature_flags)) return true;
    if (agencyStore.currentAgency?.hasClinicalOrg) return true;
  }
  return false;
});

const effectiveAgencyFeatureFlags = computed(() => {
  const effId = Number(effectiveAgencyId.value || 0);
  const opt = (agencyFilterOptions.value || []).find((r) => Number(r?.id) === effId);
  const fallbackMatches = Number(agencyStore.currentAgency?.id || 0) === effId;
  return {
    hasClinicalOrg: opt?.hasClinicalOrg === true || (opt?.hasClinicalOrg == null && fallbackMatches && !!agencyStore.currentAgency?.hasClinicalOrg),
    hasLearningOrg: opt?.hasLearningOrg === true || (opt?.hasLearningOrg == null && fallbackMatches && !!agencyStore.currentAgency?.hasLearningOrg),
    medicalBillingEnabled: opt?.medicalBillingEnabled === true
      || (fallbackMatches && isMedicalBillingEnabled(agencyStore.currentAgency?.feature_flags))
  };
});

const applySelectedBookingAgency = (agencyId) => {
  const id = Number(agencyId || 0);
  if (!id) return;
  selectedActionAgencyId.value = id;
  if (!activeScheduleAgencyIdSet.value.has(id)) {
    activeScheduleAgencyIds.value = [...(activeScheduleAgencyIds.value || []), id];
  }
  const fromOptions = (bookingAgencyOptions.value || []).find((row) => Number(row?.id) === id);
  const fromSelf = (selfScheduleAgencyOptions.value || []).find((row) => Number(row?.id) === id);
  const fromStore = (agencyStore.userAgencies || []).find((row) => Number(row?.id) === id)
    || (agencyStore.agencies || []).find((row) => Number(row?.id) === id)
    || (Number(agencyStore.currentAgency?.id) === id ? agencyStore.currentAgency : null);
  const agency = fromStore || (fromSelf
    ? {
      id: fromSelf.id,
      name: fromSelf.name,
      hasClinicalOrg: fromSelf.hasClinicalOrg,
      hasLearningOrg: fromSelf.hasLearningOrg,
      feature_flags: fromSelf.featureFlags
    }
    : null) || (fromOptions
    ? {
      id: fromOptions.id,
      name: fromOptions.label,
      hasClinicalOrg: fromOptions.hasClinicalOrg,
      hasLearningOrg: fromOptions.hasLearningOrg,
      feature_flags: fromOptions.medicalBillingEnabled ? { medicalBillingEnabled: true } : null
    }
    : null);
  if (agency) agencyStore.setCurrentAgency(agency);
  if (showRequestModal.value && showClinicalBookingFields.value) {
    void loadBookingMetadataForProvider();
  }
  if (showRequestModal.value && String(requestType.value || '') === 'individual_session') {
    void loadVirtualSessionClients();
  }
};

const onScheduleOrganizationChange = (event) => {
  const raw = event?.target?.value;
  const id = Number(raw || 0);
  if (!id) {
    selectAllScheduleAgencies();
    return;
  }
  activeScheduleAgencyIds.value = [id];
  applySelectedBookingAgency(id);
};

const onBookingAgencyChange = () => {
  applySelectedBookingAgency(selectedActionAgencyId.value);
};

// NOTE: actionAgencyOptions is declared later (after officeLocations / requestType / modalContext)
// to avoid TDZ crashes during setup when watchers evaluate the computed.

const activeScheduleAgencyIdSet = computed(
  () => new Set((activeScheduleAgencyIds.value || []).map((n) => Number(n || 0)).filter((n) => n > 0))
);

const scheduleOrgScopeAll = computed(() => {
  const allIds = (agencyFilterOptions.value || []).map((row) => Number(row?.id || 0)).filter((n) => n > 0);
  if (!allIds.length) return true;
  return allIds.every((id) => activeScheduleAgencyIdSet.value.has(id));
});

const scheduleOrgScopeValue = computed(() => {
  if (scheduleOrgScopeAll.value) return 0;
  const active = (activeScheduleAgencyIds.value || []).map((n) => Number(n || 0)).filter((n) => n > 0);
  return active.length === 1 ? active[0] : 0;
});

const scheduleOrgSelectOptions = computed(() => {
  const byId = new Map();
  for (const row of agencyFilterOptions.value || []) {
    if (row?.id) byId.set(Number(row.id), row);
  }
  for (const row of bookingAgencyOptions.value || []) {
    if (row?.id && !byId.has(Number(row.id))) byId.set(Number(row.id), row);
  }
  return Array.from(byId.values()).sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
});

const colorBlocksByTenant = computed(() => activeScheduleAgencyIdSet.value.size > 1);

const activeScheduleAgencyLegend = computed(() => (
  (agencyFilterOptions.value || []).filter((row) => activeScheduleAgencyIdSet.value.has(Number(row?.id || 0)))
));

const effectiveAgencyIds = computed(() => {
  if (props.mode === 'self' && agencyFilterOptions.value.length) {
    const active = (activeScheduleAgencyIds.value || []).map((n) => Number(n || 0)).filter((n) => n > 0);
    if (active.length) return Array.from(new Set(active));
    return agencyFilterOptions.value.map((row) => Number(row.id));
  }
  return propAgencyIds.value;
});

watch([showPeerBusyOverlay, peerBusySelectedIds, peerBusyDetailLevel, weekStart, effectiveAgencyIds], () => {
  if (showPeerBusyOverlay.value) void loadPeerBusySummaries();
}, { deep: true });

watch(effectiveAgencyIds, () => {
  if (!showPeerBusyOverlay.value) return;
  void loadPeerBusyCandidates();
}, { deep: true });

const effectiveAgencyId = computed(() => {
  const selected = Number(selectedActionAgencyId.value || 0);
  if (selected && effectiveAgencyIds.value.includes(selected)) return selected;
  return Number(effectiveAgencyIds.value[0] || 0) || null;
});

const selectAllScheduleAgencies = () => {
  activeScheduleAgencyIds.value = agencyFilterOptions.value.map((row) => Number(row.id));
};

const toggleScheduleAgencyFilter = (agencyId) => {
  const id = Number(agencyId || 0);
  if (!id) return;
  const next = new Set((activeScheduleAgencyIds.value || []).map((n) => Number(n || 0)).filter((n) => n > 0));
  if (next.has(id)) {
    // Keep at least one active organization visible.
    if (next.size <= 1) return;
    next.delete(id);
  } else {
    next.add(id);
  }
  activeScheduleAgencyIds.value = Array.from(next.values());
};

const mergeDiscoveredScheduleAgencies = (agencyIds = []) => {
  const ids = Array.from(new Set((agencyIds || []).map((n) => Number(n || 0)).filter((n) => n > 0)));
  if (!ids.length) return;
  const existing = new Set((selfScheduleAgencyOptions.value || []).map((row) => Number(row?.id || 0)));
  const additions = [];
  for (const id of ids) {
    if (existing.has(id)) continue;
    const fromBooking = (bookingAgencyOptions.value || []).find((row) => Number(row?.id || 0) === id);
    const fromStore = (agencyStore.agencies || []).find((row) => Number(row?.id || 0) === id)
      || (agencyStore.userAgencies || []).find((row) => Number(row?.id || 0) === id)
      || (Number(agencyStore.currentAgency?.id || 0) === id ? agencyStore.currentAgency : null);
    const source = fromBooking || fromStore;
    additions.push({
      id,
      name: String(source?.label || source?.name || agencyLabel(id) || `Agency ${id}`).trim(),
      organization_type: source?.organizationType || source?.organization_type || 'agency',
      hasClinicalOrg: !!source?.hasClinicalOrg,
      hasLearningOrg: !!source?.hasLearningOrg,
      medicalBillingEnabled: source?.medicalBillingEnabled === true
        || isMedicalBillingEnabled(source?.featureFlags || source?.feature_flags),
      featureFlags: source?.featureFlags || source?.feature_flags || null
    });
    existing.add(id);
    void agencyStore.hydrateAgencyById?.(id)?.then((full) => {
      const iconId = full?.icon_id ?? full?.iconId;
      if (iconId) void brandingStore.prefetchIconIds?.([iconId]);
    });
  }
  if (additions.length) {
    selfScheduleAgencyOptions.value = [...(selfScheduleAgencyOptions.value || []), ...additions];
  }
  // Keep All selected by default when new tenants appear on the calendar.
  if (scheduleOrgScopeAll.value || !activeScheduleAgencyIds.value.length) {
    activeScheduleAgencyIds.value = Array.from(existing.values());
  }
};
const canManageOffices = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return ['clinical_practice_assistant', 'provider_plus', 'admin', 'super_admin', 'superadmin', 'support', 'staff'].includes(role);
});

/** Staff/admin/platform (and supervisors for supervisees) can pick who a booking is for. */
const canSelectBookingProvider = computed(() => canManageOffices.value || isSupervisor(authStore.user));

const bookingTargetUserId = ref(0);
const bookingProvidersRaw = ref([]);
const bookingProvidersLoading = ref(false);

const scheduleActorUserId = computed(() => {
  const selected = Number(bookingTargetUserId.value || 0);
  if (selected > 0) return selected;
  return Number(props.userId || authStore.user?.id || 0) || 0;
});

const bookingProviderPickerOptions = computed(() => {
  const me = Number(authStore.user?.id || 0);
  const aid = Number(selectedActionAgencyId.value || effectiveAgencyId.value || 0);
  const rows = Array.isArray(bookingProvidersRaw.value) ? bookingProvidersRaw.value : [];
  const mapped = rows
    .map((u) => {
      const id = Number(u?.id || 0);
      if (!id) return null;
      const agencyIds = String(u?.agency_ids ?? u?.agencyIds ?? '')
        .split(',')
        .map((x) => Number(String(x).trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      const role = String(u.role || u.user_role || '').trim().replace(/_/g, ' ');
      return {
        id,
        first_name: String(u.first_name || u.firstName || '').trim(),
        last_name: String(u.last_name || u.lastName || '').trim(),
        email: String(u.email || '').trim(),
        role,
        photoUrl: String(u.profile_photo_url || u.profilePhotoUrl || '').trim() || '',
        agencyIds
      };
    })
    .filter(Boolean);
  const filtered = aid
    ? mapped.filter((u) => !u.agencyIds.length || u.agencyIds.includes(aid) || u.id === me || u.id === Number(props.userId || 0))
    : mapped;
  // Always include current actor + selected target even if directory is still loading.
  const ensure = (id, fallback = null) => {
    const n = Number(id || 0);
    if (!n || filtered.some((u) => u.id === n)) return;
    const fromRaw = mapped.find((u) => u.id === n);
    if (fromRaw) filtered.unshift(fromRaw);
    else if (fallback) filtered.unshift(fallback);
    else if (n === me) {
      filtered.unshift({
        id: me,
        first_name: String(authStore.user?.first_name || authStore.user?.firstName || 'Me').trim(),
        last_name: String(authStore.user?.last_name || authStore.user?.lastName || '').trim(),
        email: String(authStore.user?.email || '').trim(),
        role: String(authStore.user?.role || '').replace(/_/g, ' '),
        photoUrl: String(authStore.user?.profile_photo_url || authStore.user?.profilePhotoUrl || '').trim() || '',
        agencyIds: []
      });
    } else {
      filtered.unshift({
        id: n, first_name: 'Provider', last_name: String(n), email: '', role: '', photoUrl: '', agencyIds: []
      });
    }
  };
  ensure(props.userId);
  ensure(bookingTargetUserId.value);
  ensure(me);
  return filtered.map(({ id, first_name, last_name, email, role, photoUrl }) => ({
    id, first_name, last_name, email, role, photoUrl
  }));
});

const assignedProviderFace = computed(() => {
  const id = Number(
    bookingTargetUserId.value
    || modalContext.value?.assignedProviderId
    || scheduleActorUserId.value
    || 0
  );
  if (!id) return null;
  return bookingProviderPickerOptions.value.find((u) => Number(u.id) === id) || null;
});

const bookingTargetUserLabel = computed(() => {
  const id = Number(bookingTargetUserId.value || scheduleActorUserId.value || props.userId || 0);
  const opt = bookingProviderPickerOptions.value.find((u) => Number(u.id) === id);
  if (opt) {
    const ln = String(opt.last_name || '').trim();
    const fn = String(opt.first_name || '').trim();
    if (ln && fn) return `${ln}, ${fn}`;
    const name = `${fn} ${ln}`.trim();
    return name || opt.email || `User ${id}`;
  }
  if (id && id === Number(authStore.user?.id || 0)) {
    const meLn = String(authStore.user?.last_name || authStore.user?.lastName || '').trim();
    const meFn = String(authStore.user?.first_name || authStore.user?.firstName || '').trim();
    if (meLn && meFn) return `${meLn}, ${meFn}`;
    return 'Me';
  }
  return id ? `User ${id}` : '—';
});

const headerTenantOptions = computed(() => (bookingAgencyOptions.value || []).slice());

const requestedProviderPayload = () => {
  const pid = Number(scheduleActorUserId.value || 0);
  const me = Number(authStore.user?.id || 0);
  if (!pid) return {};
  if (canSelectBookingProvider.value || isAdminMode.value || pid !== me) {
    return { requestedProviderId: pid };
  }
  return {};
};

const loadBookingProviderDirectory = async () => {
  if (!canSelectBookingProvider.value) {
    bookingProvidersRaw.value = [];
    return;
  }
  try {
    bookingProvidersLoading.value = true;
    const resp = await api.get('/users', { params: { _t: Date.now() }, skipGlobalLoading: true });
    bookingProvidersRaw.value = Array.isArray(resp?.data) ? resp.data : [];
  } catch {
    bookingProvidersRaw.value = [];
  } finally {
    bookingProvidersLoading.value = false;
  }
};

const setBookingTargetUser = (userId) => {
  const id = Number(userId || 0);
  if (!id) return;
  const prev = Number(bookingTargetUserId.value || 0);
  bookingTargetUserId.value = id;
  if (id !== prev) {
    emit('change-schedule-user', id);
  }
  if (showRequestModal.value && String(requestType.value || '') === 'individual_session') {
    void loadVirtualSessionClients();
  }
  if (showRequestModal.value && showClinicalBookingFields.value) {
    void loadBookingMetadataForProvider();
  }
};

const officeRequestsApproveLink = computed(() => {
  const orgSlug = typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : '';
  const path = orgSlug ? `/${orgSlug}/admin/availability-intake` : '/admin/availability-intake';
  return { path, query: { tab: 'office' } };
});
const currentUserRole = computed(() => String(authStore.user?.role || '').trim().toLowerCase());
const isProviderPlus = computed(() => currentUserRole.value === 'provider_plus');
const canScheduleSupervisionFromGrid = computed(() => isSupervisor(authStore.user));
const isViewingOtherUserSchedule = computed(() => {
  if (!isAdminMode.value) return false;
  const actorId = Number(authStore.user?.id || 0);
  const targetId = Number(props.userId || 0);
  return !!actorId && !!targetId && actorId !== targetId;
});
const canBookFromGrid = computed(
  () => props.mode === 'self'
    || (isAdminMode.value && (canManageOffices.value || canScheduleSupervisionFromGrid.value))
);

const availabilityClass = (dayName, hour, minute = 0) => {
  const a = props.availabilityOverlay && typeof props.availabilityOverlay === 'object' ? props.availabilityOverlay : null;
  if (!a) return '';
  const virtual = Array.isArray(a.virtualSlots) ? a.virtualSlots : [];
  const office = Array.isArray(a.inPersonSlots) ? a.inPersonSlots : [];

  if (ALL_DAYS.indexOf(String(dayName)) < 0) return '';
  const cellDate = addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dayName));
  const cellStart = new Date(`${cellDate}T${pad2(hour)}:${pad2(minute)}:00`);
  const duration = showQuarterDetail.value ? 15 : 60;
  const cellEnd = new Date(cellStart.getTime() + (duration * 60 * 1000));
  if (Number.isNaN(cellStart.getTime()) || Number.isNaN(cellEnd.getTime())) return '';

  const overlaps = (slot) => {
    const st = new Date(slot.startAt);
    const en = new Date(slot.endAt);
    if (Number.isNaN(st.getTime()) || Number.isNaN(en.getTime())) return false;
    return en > cellStart && st < cellEnd;
  };

  const hasV = virtual.some(overlaps);
  const hasO = office.some(overlaps);
  if (hasV && hasO) return 'cell-avail-both';
  if (hasV) return 'cell-avail-virtual';
  if (hasO) return 'cell-avail-office';
  return '';
};

// If Google busy is enabled but the backend reports an auth/impersonation failure (invalid_grant),
// auto-disable it so the schedule does not feel “broken” on load.
const googleBusyDisabledHint = ref('');
const autoDisabledGoogleBusy = ref(false);
const isGoogleInvalidGrant = (msg) => String(msg || '').toLowerCase().includes('invalid_grant');

const filterSummaryByActiveAgencies = (data) => {
  if (!data || typeof data !== 'object') return data;
  const active = activeScheduleAgencyIdSet.value;
  // When All (or only one) is selected, keep everything from the all-agencies payload.
  if (!active.size || scheduleOrgScopeAll.value) return data;
  const keep = (row) => {
    const aid = Number(row?.agencyId || row?._agencyId || 0);
    return !aid || active.has(aid);
  };
  return {
    ...data,
    officeRequests: (data.officeRequests || []).filter(keep),
    schoolRequests: (data.schoolRequests || []).filter(keep),
    schoolAssignments: (data.schoolAssignments || []).filter(keep),
    officeEvents: (data.officeEvents || []).filter(keep),
    supervisionSessions: (data.supervisionSessions || []).filter(keep),
    scheduleEvents: (data.scheduleEvents || []).filter(keep),
    virtualWorkingHours: (data.virtualWorkingHours || []).filter(keep)
  };
};

const load = async ({ forceRefresh = false } = {}) => {
  if (!props.userId) return;
  if (!effectiveAgencyIds.value.length) {
    if (props.mode === 'self' && !selfScheduleAgenciesLoaded.value) {
      error.value = '';
      summary.value = null;
      return;
    }
    // Self mode can still load cross-tenant bookings even with empty membership chips.
    if (props.mode !== 'self') {
      summary.value = null;
      error.value = 'Select an organization first.';
      return;
    }
  }

  const ids = effectiveAgencyIds.value;
  const useAllAgencies = props.mode === 'self';
  const cacheKey = `${props.userId}|${useAllAgencies ? 'all' : [...ids].sort((a, b) => a - b).join(',')}|${weekStart.value}|${showGoogleBusy.value}|${showGoogleEvents.value}|${showExternalBusy.value}|${(selectedExternalCalendarIds.value || []).slice().sort((a, b) => a - b).join(',')}`;
  const cached = forceRefresh ? null : getScheduleSummary(cacheKey);
  if (cached) {
    mergeDiscoveredScheduleAgencies(cached.scheduleAgencyIds || []);
    summary.value = filterSummaryByActiveAgencies(cached);
    error.value = '';
    loading.value = false;
    return;
  }

  try {
    if (!cached) loading.value = true;
    error.value = '';

    // Self / My Schedule: one cross-tenant request so every booking shows (and load stays fast).
    if (useAllAgencies) {
      const resp = await api.get(`/users/${props.userId}/schedule-summary`, {
        params: {
          weekStart: weekStart.value,
          includeAllAgencies: 'true',
          includeGoogleBusy: props.hideOfficeAndCalendarIntegration ? 'false' : (showGoogleBusy.value ? 'true' : 'false'),
          includeGoogleEvents: props.hideOfficeAndCalendarIntegration ? 'false' : (showGoogleEvents.value ? 'true' : 'false'),
          ...(props.hideOfficeAndCalendarIntegration ? {} : (showExternalBusy.value && selectedExternalCalendarIds.value.length
            ? { externalCalendarIds: selectedExternalCalendarIds.value.join(',') }
            : {}))
        }
      });
      const data = resp.data || null;
      if (data) {
        const tagged = {
          ...data,
          scheduleEvents: (data.scheduleEvents || []).map((ev) => ({
            ...ev,
            _agencyId: Number(ev?.agencyId || 0) || null
          })),
          officeEvents: (data.officeEvents || []).map((ev) => ({
            ...ev,
            _agencyId: Number(ev?.agencyId || 0) || null
          })),
          supervisionSessions: (data.supervisionSessions || []).map((ev) => ({
            ...ev,
            _agencyId: Number(ev?.agencyId || 0) || null
          })),
          schoolAssignments: (data.schoolAssignments || []).map((ev) => ({
            ...ev,
            _agencyId: Number(ev?.agencyId || 0) || null
          })),
          officeRequests: (data.officeRequests || []).map((ev) => ({
            ...ev,
            _agencyId: Number(ev?.agencyId || 0) || null
          })),
          schoolRequests: (data.schoolRequests || []).map((ev) => ({
            ...ev,
            _agencyId: Number(ev?.agencyId || 0) || null
          })),
          virtualWorkingHours: (data.virtualWorkingHours || []).map((row) => ({
            ...row,
            _agencyId: Number(row?.agencyId || 0) || null
          }))
        };
        mergeDiscoveredScheduleAgencies(tagged.scheduleAgencyIds || []);
        setScheduleSummary(cacheKey, tagged);
        summary.value = filterSummaryByActiveAgencies(tagged);
      } else {
        summary.value = null;
      }
    } else if (ids.length === 1) {
      const resp = await api.get(`/users/${props.userId}/schedule-summary`, {
        params: {
          weekStart: weekStart.value,
          agencyId: ids[0],
          includeGoogleBusy: props.hideOfficeAndCalendarIntegration ? 'false' : (showGoogleBusy.value ? 'true' : 'false'),
          includeGoogleEvents: props.hideOfficeAndCalendarIntegration ? 'false' : (showGoogleEvents.value ? 'true' : 'false'),
          ...(props.hideOfficeAndCalendarIntegration ? {} : (showExternalBusy.value && selectedExternalCalendarIds.value.length
            ? { externalCalendarIds: selectedExternalCalendarIds.value.join(',') }
            : {}))
        }
      });
      const data = resp.data || null;
      summary.value = data;
      setScheduleSummary(cacheKey, summary.value);
    } else {
      const results = await Promise.all(
          ids.map((agencyId) =>
            api
              .get(`/users/${props.userId}/schedule-summary`, {
                params: {
                  weekStart: weekStart.value,
                  agencyId,
                  includeGoogleBusy: props.hideOfficeAndCalendarIntegration ? 'false' : (showGoogleBusy.value ? 'true' : 'false'),
                  includeGoogleEvents: props.hideOfficeAndCalendarIntegration ? 'false' : (showGoogleEvents.value ? 'true' : 'false'),
                  ...(props.hideOfficeAndCalendarIntegration ? {} : (showExternalBusy.value && selectedExternalCalendarIds.value.length
                    ? { externalCalendarIds: selectedExternalCalendarIds.value.join(',') }
                    : {}))
                }
              })
              .then((r) => ({ ok: true, agencyId, data: r.data }))
              .catch((e) => ({
                ok: false,
                agencyId,
                error: e?.response?.data?.error?.message || e?.message || 'Failed to load schedule'
              }))
          )
      );

      const okOnes = results.filter((r) => r.ok && r.data);
      const first = okOnes[0]?.data || null;
      if (!first) {
        summary.value = null;
        const msgs = results
          .filter((r) => !r.ok)
          .map((r) => `${agencyLabel(r.agencyId) || `Agency ${r.agencyId}`}: ${r.error}`);
        error.value = msgs.length ? msgs.join(' • ') : 'Failed to load schedule';
        return;
      }

      const tag = (row, agencyId) => {
        const hasRowAgency = row && Object.prototype.hasOwnProperty.call(row, 'agencyId');
        const taggedAgencyId = hasRowAgency
          ? (Number(row?.agencyId || 0) || null)
          : (Number(agencyId || 0) || null);
        return { ...row, _agencyId: taggedAgencyId };
      };
      const merged = {
        ...first,
        // Preserve one “current” agencyId for legacy consumers, but include the full list too.
        agencyId: first.agencyId || ids[0],
        agencyIds: [...ids],
        officeRequests: [],
        schoolRequests: [],
        schoolAssignments: [],
        officeEvents: [],
        supervisionSessions: [],
        scheduleEvents: [],
        virtualWorkingHours: []
      };

      // Union calendars available (per-user, but keep stable)
      const calMap = new Map();
      for (const r of okOnes) {
        for (const c of r.data?.externalCalendarsAvailable || []) {
          const id = Number(c?.id || 0);
          if (!id) continue;
          if (!calMap.has(id)) calMap.set(id, { id, label: c?.label || '' });
        }
      }
      merged.externalCalendarsAvailable = Array.from(calMap.values());

      // Office events are assigned to the user, not the agency. When a building is shared across
      // agencies, the same event is returned per agency. Deduplicate by (roomId, startAt, endAt).
      const officeEventKey = (e) => `${Number(e?.roomId || 0)}|${String(e?.startAt || '').slice(0, 19)}|${String(e?.endAt || '').slice(0, 19)}`;
      const seenOfficeKeys = new Set();
      // Person-level schedule events (agencyId NULL) can appear in each agency response.
      // Deduplicate by stable event id (fallback to kind/time signature for safety).
      const scheduleEventKey = (e) => {
        const kind = String(e?.kind || '').toUpperCase();
        const id = Number(e?.id || 0);
        if (id > 0) return `${kind || 'EVT'}:${id}`;
        return `sig:${kind}|${String(e?.startAt || e?.startDate || '')}|${String(e?.endAt || e?.endDate || '')}|${String(e?.title || '')}`;
      };
      const seenScheduleEventKeys = new Set();
      for (const r of okOnes) {
        const aId = r.agencyId;
        merged.officeRequests.push(...(r.data?.officeRequests || []).map((x) => tag(x, aId)));
        merged.schoolRequests.push(...(r.data?.schoolRequests || []).map((x) => tag(x, aId)));
        merged.schoolAssignments.push(...(r.data?.schoolAssignments || []).map((x) => tag(x, aId)));
        for (const e of (r.data?.officeEvents || []).map((x) => tag(x, aId))) {
          const k = officeEventKey(e);
          if (!seenOfficeKeys.has(k)) {
            seenOfficeKeys.add(k);
            merged.officeEvents.push(e);
          }
        }
        merged.supervisionSessions.push(...(r.data?.supervisionSessions || []).map((x) => tag(x, aId)));
        for (const e of (r.data?.scheduleEvents || []).map((x) => tag(x, aId))) {
          const k = scheduleEventKey(e);
          if (seenScheduleEventKeys.has(k)) continue;
          seenScheduleEventKeys.add(k);
          merged.scheduleEvents.push(e);
        }
        for (const row of (r.data?.virtualWorkingHours || []).map((x) => tag(x, aId))) {
          const k = `vwh|${Number(row?.agencyId || aId || 0)}|${row?.dayOfWeek}|${row?.startTime}|${row?.endTime}|${row?.sessionType}`;
          if (seenScheduleEventKeys.has(k)) continue;
          seenScheduleEventKeys.add(k);
          merged.virtualWorkingHours.push(row);
        }
      }

      // Prefer overlay info from the first successful result (per-user; not agency-scoped).
      merged.googleBusy = first.googleBusy || [];
      merged.googleBusyError = first.googleBusyError || null;
      merged.externalCalendars = first.externalCalendars || [];
      summary.value = merged;
      setScheduleSummary(cacheKey, summary.value);
    }

    // Fail-soft Google busy: if the user’s email cannot be impersonated (invalid_grant),
    // turn off Google busy and persist the preference.
    if (props.mode === 'self' && showGoogleBusy.value && !autoDisabledGoogleBusy.value) {
      const errMsg = String(summary.value?.googleBusyError || '').trim();
      if (errMsg && isGoogleInvalidGrant(errMsg)) {
        autoDisabledGoogleBusy.value = true;
        googleBusyDisabledHint.value =
          'Google busy is unavailable for your account (Google Workspace could not validate your email). We turned it off for now.';
        // Hide immediately, then the watcher will reload without Google busy.
        showGoogleBusy.value = false;
        try {
          if (summary.value && typeof summary.value === 'object') summary.value.googleBusyError = null;
        } catch {
          // ignore
        }
      }
    }

    // Office reminder: pulse + 3s toast once per session when My Schedule loads
    if (props.mode === 'self' && summary.value) {
      nextTick(() => showOfficeReminder());
    }
  } catch (e) {
    if (!cached) {
      summary.value = null;
      error.value = e.response?.data?.error?.message || 'Failed to load schedule';
    }
    // If we had cache, keep showing it on fetch failure
  } finally {
    loading.value = false;
  }
};

// Defer + debounce load so startup/watcher bursts do not spam schedule-summary.
let deferredLoadTimer = null;
let deferredLoadIdleHandle = null;
const clearDeferredLoad = () => {
  if (deferredLoadTimer) {
    clearTimeout(deferredLoadTimer);
    deferredLoadTimer = null;
  }
  if (deferredLoadIdleHandle && typeof cancelIdleCallback !== 'undefined') {
    cancelIdleCallback(deferredLoadIdleHandle);
    deferredLoadIdleHandle = null;
  }
};
const deferredLoad = () => {
  clearDeferredLoad();
  deferredLoadTimer = setTimeout(() => {
    deferredLoadTimer = null;
    if (typeof requestIdleCallback !== 'undefined') {
      deferredLoadIdleHandle = requestIdleCallback(() => {
        deferredLoadIdleHandle = null;
        void load();
      }, { timeout: 120 });
    } else {
      void load();
    }
  }, 150);
};
watch(() => props.userId, deferredLoad, { immediate: true });
// Admin/multi-user mode still reloads when the agency scope changes. Self mode uses one
// includeAllAgencies payload and filters client-side (avoids N× slow schedule-summary calls).
watch(effectiveAgencyIds, () => {
  if (props.mode === 'self') return;
  deferredLoad();
}, { deep: true });
watch([showGoogleBusy, showGoogleEvents, showExternalBusy, selectedExternalCalendarIds], deferredLoad, { deep: true });

// Org chip toggles filter the already-loaded all-tenant payload (no refetch).
watch(activeScheduleAgencyIds, () => {
  if (props.mode !== 'self') return;
  const cached = getScheduleSummary(
    `${props.userId}|all|${weekStart.value}|${showGoogleBusy.value}|${showGoogleEvents.value}|${showExternalBusy.value}|${(selectedExternalCalendarIds.value || []).slice().sort((a, b) => a - b).join(',')}`
  );
  if (cached) summary.value = filterSummaryByActiveAgencies(cached);
}, { deep: true });

// Once self agencies finish loading, kick the first all-tenant fetch if needed.
watch(selfScheduleAgenciesLoaded, (loaded) => {
  if (props.mode === 'self' && loaded) deferredLoad();
});

watch([() => props.mode, () => props.userId], () => {
  void loadSelfScheduleAgencies();
}, { immediate: true });

// When chips would show "Agency 123", fetch `/agencies/:id` so store lists get real names (admin / multi-org view).
watch(
  [propAgencyIds, selfScheduleAgencyOptions],
  () => {
    const want = new Set();
    for (const raw of propAgencyIds.value || []) {
      const n = Number(raw || 0);
      if (n) want.add(n);
    }
    for (const row of selfScheduleAgencyOptions.value || []) {
      const n = Number(row?.id || 0);
      if (n) want.add(n);
    }
    for (const id of want) {
      if (agencyNameFromStore(id)) continue;
      void agencyStore.hydrateAgencyById(id);
    }
  },
  { immediate: true, deep: true }
);

watch(agencyFilterOptions, (rows) => {
  const availableIds = new Set((rows || []).map((row) => Number(row?.id || 0)).filter((n) => n > 0));
  const currentActive = (activeScheduleAgencyIds.value || []).map((n) => Number(n || 0)).filter((n) => availableIds.has(n));
  if (currentActive.length) {
    activeScheduleAgencyIds.value = currentActive;
  } else if (availableIds.size) {
    activeScheduleAgencyIds.value = Array.from(availableIds.values());
  } else {
    activeScheduleAgencyIds.value = [];
  }

  const selected = Number(selectedActionAgencyId.value || 0);
  if (!selected || !activeScheduleAgencyIds.value.includes(selected)) {
    selectedActionAgencyId.value = Number(activeScheduleAgencyIds.value[0] || 0) || Number((rows || [])[0]?.id || 0) || 0;
  }
}, { immediate: true, deep: true });

watch(
  () => props.weekStartYmd,
  (next) => {
    const anchor = next && String(next).trim() ? next : new Date();
    const monday = startOfWeekMondayYmd(anchor);
    if (monday && monday !== weekStart.value) {
      weekStart.value = monday;
      load();
    }
  }
);

watch(externalCalendarsAvailable, (next) => {
  // Drop selections that no longer exist in the available list.
  const allowed = new Set((next || []).map((c) => Number(c.id)));

  // Avoid clearing persisted selections during transient empty states
  // (for example while self agencies are still loading).
  if (props.mode === 'self' && allowed.size === 0) return;

  // Provider defaults: if no saved prefs exist, default ALL external calendars on once we know what's available.
  if (
    props.mode === 'self' &&
    overlayPrefsLoaded.value &&
    shouldDefaultSelectAllExternal.value &&
    (selectedExternalCalendarIds.value || []).length === 0 &&
    allowed.size > 0
  ) {
    selectedExternalCalendarIds.value = Array.from(allowed.values());
    shouldDefaultSelectAllExternal.value = false;
  }

  const current = (selectedExternalCalendarIds.value || []).map((n) => Number(n)).filter((n) => allowed.has(n));
  if (current.length !== (selectedExternalCalendarIds.value || []).length) {
    selectedExternalCalendarIds.value = current;
  }

  // Admin/audit view should show overlays by default (first load only).
  if (!initializedOverlayDefaults.value && props.mode === 'admin') {
    if (selectedExternalCalendarIds.value.length === 0 && allowed.size > 0) {
      selectedExternalCalendarIds.value = Array.from(allowed.values());
    }
    // Default Google busy on for admin auditing.
    showGoogleBusy.value = true;
    showExternalBusy.value = true;
    initializedOverlayDefaults.value = true;
  }

  // Persist (best-effort) once the available list stabilizes and any defaulting/cleanup is applied.
  if (props.mode === 'self' && overlayPrefsLoaded.value) saveOverlayPrefs();
});

// Persist overlay/view settings (provider UX only).
watch([showGoogleBusy, showGoogleEvents, showExternalBusy, showOfficeOverlay, hideExternalIcsTitles, selectedExternalCalendarIds, hideWeekend, showAllHours, viewMode], () => {
  if (props.mode !== 'self' || !overlayPrefsLoaded.value) return;
  saveOverlayPrefs();
}, { deep: true });

watch(hideWeekend, () => {
  if (props.mode !== 'self') return;
  saveHideWeekendPref();
});

watch(showAllHours, () => {
  if (props.mode !== 'self') return;
  saveShowAllHoursPref();
});

const prevWeek = () => {
  weekStart.value = addDaysYmd(weekStart.value, -7);
  emit('update:weekStartYmd', weekStart.value);
  load();
};
const nextWeek = () => {
  weekStart.value = addDaysYmd(weekStart.value, 7);
  emit('update:weekStartYmd', weekStart.value);
  load();
};
const goToTodayWeek = () => {
  const monday = startOfWeekMondayYmd(new Date());
  if (!monday) return;
  weekStart.value = monday;
  emit('update:weekStartYmd', weekStart.value);
  load();
};

const weekdayToIndex = (dayName) => {
  // Backend expects 0=Sunday..6=Saturday
  const map = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 0 };
  return map[String(dayName)] ?? null;
};

const overlapsHour = (startHHMM, endHHMM, hour) => {
  const start = String(startHHMM || '').slice(0, 5);
  const end = String(endHHMM || '').slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return false;
  const slotStart = `${pad2(hour)}:00`;
  const slotEnd = `${pad2(hour + 1)}:00`;
  return start < slotEnd && end > slotStart;
};

const hasRequest = (dayName, hour) => {
  const s = summary.value;
  if (!s) return false;
  for (const r of s.officeRequests || []) {
    for (const slot of r.slots || []) {
      const dn = ALL_DAYS[((Number(slot.weekday) + 6) % 7)] || null; // 0=Sun -> Sunday(end), 1=Mon -> Monday
      if (dn !== dayName) continue;
      if (Number(hour) >= Number(slot.startHour) && Number(hour) < Number(slot.endHour)) return true;
    }
  }
  for (const r of s.schoolRequests || []) {
    for (const b of r.blocks || []) {
      if (String(b.dayOfWeek) !== dayName) continue;
      if (overlapsHour(b.startTime, b.endTime, hour)) return true;
    }
  }
  return false;
};

const pendingRequestTotalCount = computed(() => {
  const s = summary.value;
  if (!s) return 0;
  const office = Array.isArray(s.officeRequests) ? s.officeRequests.length : 0;
  const school = Array.isArray(s.schoolRequests) ? s.schoolRequests.length : 0;
  return office + school;
});

const canUnrequestAllPending = computed(() => props.mode === 'self' && pendingRequestTotalCount.value > 0);

const unrequestAllPendingRequests = async ({ keepModalOpen = false } = {}) => {
  if (!canUnrequestAllPending.value) return;
  try {
    submitting.value = true;
    modalError.value = '';
    await api.post('/availability/me/requests/unrequest-all', {
      agencyId: effectiveAgencyId.value || undefined
    });
    invalidateScheduleSummaryCacheForUser(props.userId);
    await load();
    if (!keepModalOpen) closeModal();
  } catch (e) {
    modalError.value = e.response?.data?.error?.message || 'Failed to unrequest pending availability requests.';
  } finally {
    submitting.value = false;
  }
};

const supervisionDateYmd = (ev) => {
  const fromApi = String(ev?.startDateYmd || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromApi)) return fromApi;
  const raw = String(ev?.startAt || '').trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
};
const supervisionDayName = (ev) => {
  const ymd = supervisionDateYmd(ev);
  if (!ymd) return null;
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const dayNamesSunFirst = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return dayNamesSunFirst[d.getDay()] || null;
};

const hasSupervision = (dayName, hour) => {
  const s = summary.value;
  if (!s) return false;
  const list = s.supervisionSessions || [];
  for (const ev of list) {
    const startRaw = String(ev.startAt || '').trim();
    const endRaw = String(ev.endAt || '').trim();
    if (!startRaw || !endRaw) continue;
    const startLocal = new Date(startRaw.includes('T') ? startRaw : startRaw.replace(' ', 'T'));
    const endLocal = new Date(endRaw.includes('T') ? endRaw : endRaw.replace(' ', 'T'));
    if (Number.isNaN(startLocal.getTime()) || Number.isNaN(endLocal.getTime())) continue;
    const dn = supervisionDayName(ev);
    if (dn !== dayName) continue;
    const cellDate = addDaysYmd(s.weekStart || weekStart.value, dayIdxFromWeekStartMonday(dayName));
    const cellStart = new Date(`${cellDate}T${pad2(hour)}:00:00`);
    const cellEnd = new Date(`${cellDate}T${pad2(hour + 1)}:00:00`);
    if (endLocal > cellStart && startLocal < cellEnd) return true;
  }
  return false;
};

const supervisionLabel = (dayName, hour) => {
  const s = summary.value;
  const list = s?.supervisionSessions || [];
  const names = [];
  for (const ev of list) {
    const startRaw = String(ev.startAt || '').trim();
    const endRaw = String(ev.endAt || '').trim();
    if (!startRaw || !endRaw) continue;
    const startLocal = new Date(startRaw.includes('T') ? startRaw : startRaw.replace(' ', 'T'));
    const endLocal = new Date(endRaw.includes('T') ? endRaw : endRaw.replace(' ', 'T'));
    if (Number.isNaN(startLocal.getTime()) || Number.isNaN(endLocal.getTime())) continue;
    const dn = supervisionDayName(ev);
    if (dn !== dayName) continue;
    const cellDate = addDaysYmd(s.weekStart || weekStart.value, dayIdxFromWeekStartMonday(dayName));
    const cellStart = new Date(`${cellDate}T${pad2(hour)}:00:00`);
    const cellEnd = new Date(`${cellDate}T${pad2(hour + 1)}:00:00`);
    if (!(endLocal > cellStart && startLocal < cellEnd)) continue;
    const nm = String(ev.counterpartyName || '').trim();
    if (nm) names.push(nm);
  }
  const listInCell = [];
  for (const ev of list) {
    const startRaw = String(ev.startAt || '').trim();
    const endRaw = String(ev.endAt || '').trim();
    if (!startRaw || !endRaw) continue;
    const startLocal = new Date(startRaw.includes('T') ? startRaw : startRaw.replace(' ', 'T'));
    const endLocal = new Date(endRaw.includes('T') ? endRaw : endRaw.replace(' ', 'T'));
    if (Number.isNaN(startLocal.getTime()) || Number.isNaN(endLocal.getTime())) continue;
    const dn = supervisionDayName(ev);
    if (dn !== dayName) continue;
    const cellDate = addDaysYmd(s.weekStart || weekStart.value, dayIdxFromWeekStartMonday(dayName));
    const cellStart = new Date(`${cellDate}T${pad2(hour)}:00:00`);
    const cellEnd = new Date(`${cellDate}T${pad2(hour + 1)}:00:00`);
    if (endLocal > cellStart && startLocal < cellEnd) listInCell.push(ev);
  }
  const hasPresenter = listInCell.some((ev) => String(ev?.presenterRole || '').trim().length > 0);
  const timing = showQuarterDetail.value && listInCell.length
    ? quarterTimingFromRange(listInCell[0]?.startAt, listInCell[0]?.endAt)
    : '';
  const prefix = timing ? `${timing} ` : '';
  if (!names.length) return `${prefix}${hasPresenter ? 'Presenting' : 'Supv'}`;
  if (names.length === 1) return `${prefix}${names[0]}`;
  const base = hasPresenter ? `Presenting • ${names[0]}+${names.length - 1}` : `${names[0]}+${names.length - 1}`;
  return `${prefix}${base}`;
};

const supervisionTitle = (dayName, hour) => {
  const s = summary.value;
  const list = s?.supervisionSessions || [];
  const hits = [];
  for (const ev of list) {
    const startRaw = String(ev.startAt || '').trim();
    const endRaw = String(ev.endAt || '').trim();
    if (!startRaw || !endRaw) continue;
    const startLocal = new Date(startRaw.includes('T') ? startRaw : startRaw.replace(' ', 'T'));
    const endLocal = new Date(endRaw.includes('T') ? endRaw : endRaw.replace(' ', 'T'));
    if (Number.isNaN(startLocal.getTime()) || Number.isNaN(endLocal.getTime())) continue;
    const dn = supervisionDayName(ev);
    if (dn !== dayName) continue;
    const cellDate = addDaysYmd(s.weekStart || weekStart.value, dayIdxFromWeekStartMonday(dayName));
    const cellStart = new Date(`${cellDate}T${pad2(hour)}:00:00`);
    const cellEnd = new Date(`${cellDate}T${pad2(hour + 1)}:00:00`);
    if (endLocal > cellStart && startLocal < cellEnd) hits.push(ev);
  }
  const withNames = hits.map((ev) => String(ev.counterpartyName || '').trim()).filter(Boolean);
  const who = withNames.length ? withNames.join(', ') : '—';
  const presenterRows = hits.filter((ev) => String(ev?.presenterRole || '').trim().length > 0);
  const presenterText = presenterRows.length
    ? ` • Presenter (${presenterRows.map((ev) => String(ev.presenterRole || 'primary')).join(', ')})`
    : '';
  return `Supervision — ${who} — ${dayName} ${hourLabel(hour)}${presenterText}`;
};

const scheduleEventsInCell = (dayName, hour, minute = 0) => {
  const s = summary.value;
  if (!s) return [];
  const ws = s.weekStart || weekStart.value;
  if (ALL_DAYS.indexOf(String(dayName)) < 0) return [];
  const cellDate = addDaysYmd(ws, dayIdxFromWeekStartMonday(dayName));
  const cellStart = new Date(`${cellDate}T${pad2(hour)}:${pad2(minute)}:00`);
  const cellEnd = new Date(cellStart.getTime() + ((showQuarterDetail.value ? 15 : 60) * 60 * 1000));
  const list = Array.isArray(s.scheduleEvents) ? s.scheduleEvents : [];
  const hits = [];
  for (const ev of list) {
    // For most schedule events, avoid duplicate blocks when Google titles are enabled.
    // Keep TEAM_MEETING/HUDDLE visible because they carry app/Twilio join behavior.
    const eventKind = String(ev?.kind || '').trim().toUpperCase();
    const isInternalMeeting = eventKind === 'TEAM_MEETING' || eventKind === 'HUDDLE';
    if (ev?.googleEventId && showGoogleEvents.value && !isInternalMeeting) continue;
    if (ev?.allDay) {
      const startDate = String(ev?.startDate || '').slice(0, 10);
      const endDate = String(ev?.endDate || '').slice(0, 10);
      if (!startDate || !endDate) continue;
      if (cellDate >= startDate && cellDate < endDate) hits.push(ev);
      continue;
    }
    const stRaw = String(ev?.startAt || '').trim();
    const enRaw = String(ev?.endAt || '').trim();
    if (!stRaw || !enRaw) continue;
    const st = new Date(stRaw.includes('T') ? stRaw : stRaw.replace(' ', 'T'));
    const en = new Date(enRaw.includes('T') ? enRaw : enRaw.replace(' ', 'T'));
    if (Number.isNaN(st.getTime()) || Number.isNaN(en.getTime())) continue;
    if (en > cellStart && st < cellEnd) hits.push(ev);
  }
  return hits;
};

const parseLocalDateTime = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return null;
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
};

const roundDateToNearestQuarter = (raw) => {
  const d = raw instanceof Date ? new Date(raw.getTime()) : parseLocalDateTime(raw);
  if (!d) return null;
  let quarter = Math.round(d.getMinutes() / 15) * 15;
  if (quarter >= 60) {
    d.setHours(d.getHours() + 1);
    quarter = 0;
  }
  d.setMinutes(quarter, 0, 0);
  return d;
};

const quarterClockLabel = (raw) => {
  const d = roundDateToNearestQuarter(raw);
  if (!d) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

/** Clock label for this schedule cell (15- or 60-min), used for Therapy Notes / ebusy titles and row prefixes. */
const slotClockLabel = (dayName, hour, minute = 0) => {
  const ws = summary.value?.weekStart || weekStart.value;
  if (ALL_DAYS.indexOf(String(dayName)) < 0) return '';
  const cellDate = addDaysYmd(ws, dayIdxFromWeekStartMonday(dayName));
  const cellStart = new Date(`${cellDate}T${pad2(hour)}:${pad2(minute)}:00`);
  if (Number.isNaN(cellStart.getTime())) return '';
  return cellStart.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const quarterTimingFromRange = (startRaw, endRaw) => {
  const s = quarterClockLabel(startRaw);
  const e = quarterClockLabel(endRaw);
  if (s && e) return `${s}-${e}`;
  return s || e || '';
};
const quarterSegmentForRange = (dayName, hour, minute, startRaw, endRaw) => {
  if (!showQuarterDetail.value) return 'single';
  const s = parseLocalDateTime(startRaw);
  const e = parseLocalDateTime(endRaw);
  if (!s || !e) return 'single';
  if (ALL_DAYS.indexOf(String(dayName)) < 0) return 'single';
  const ws = summary.value?.weekStart || weekStart.value;
  const cellDate = addDaysYmd(ws, dayIdxFromWeekStartMonday(dayName));
  const cellStart = new Date(`${cellDate}T${pad2(hour)}:${pad2(minute)}:00`);
  if (Number.isNaN(cellStart.getTime())) return 'single';
  const stepMs = 15 * 60 * 1000;
  const cellEnd = new Date(cellStart.getTime() + stepMs);
  const prevStart = new Date(cellStart.getTime() - stepMs);
  const nextEnd = new Date(cellEnd.getTime() + stepMs);
  const hasPrev = e > prevStart && s < cellStart;
  const hasNext = e > cellEnd && s < nextEnd;
  if (!hasPrev && !hasNext) return 'single';
  if (!hasPrev && hasNext) return 'start';
  if (hasPrev && !hasNext) return 'end';
  return 'middle';
};
const shouldShowQuarterBlockLabel = (segmentClass, minute = 0) => {
  if (!showQuarterDetail.value) return true;
  return segmentClass === 'single' || segmentClass === 'start' || Number(minute) === 0;
};
const shouldHideQuarterAgencyDot = (segmentClass, minute = 0) => {
  if (!showQuarterDetail.value) return false;
  return (segmentClass === 'middle' || segmentClass === 'end') && Number(minute) !== 0;
};

const scheduleEventShortLabel = (ev) => {
  const raw = String(ev?.title || '').trim() || 'Event';
  const eventKind = String(ev?.kind || '').trim().toUpperCase();
  let typePrefix = '';
  if (colorBlocksByTenant.value) {
    if (eventKind === 'TEAM_MEETING') typePrefix = 'Mtg';
    else if (eventKind === 'HUDDLE') typePrefix = 'Huddle';
    else if (eventKind === 'SCHEDULE_HOLD') typePrefix = 'Hold';
    else if (eventKind === 'INDIRECT_SERVICES') typePrefix = 'Indirect';
    else if (eventKind === 'PERSONAL_EVENT' && isClientSessionScheduleEvent(ev)) typePrefix = 'Session';
    else if (eventKind === 'PERSONAL_EVENT') typePrefix = 'Personal';
    else if (/virtual|session/i.test(raw)) typePrefix = 'Session';
    else typePrefix = 'Event';
  }
  const labeled = typePrefix ? `${typePrefix} · ${raw}` : raw;
  const timing = quarterTimingFromRange(ev?.startAt, ev?.endAt);
  const withTiming = showQuarterDetail.value && timing ? `${timing} ${labeled}` : labeled;
  return withTiming.length > 26 ? `${withTiming.slice(0, 26)}…` : withTiming;
};

const scheduleEventBlockTitle = (ev, dayName, hour) => {
  const raw = String(ev?.title || '').trim() || 'Schedule event';
  const privateTag = ev?.isPrivate ? ' • Private' : '';
  return `${raw}${privateTag} — ${dayName} ${hourLabel(hour)}`;
};

const hasSchool = (dayName, hour) => {
  const s = summary.value;
  if (!s) return false;
  for (const a of s.schoolAssignments || []) {
    if (String(a.dayOfWeek) !== dayName) continue;
    if (overlapsHour(a.startTime, a.endTime, hour)) return true;
  }
  return false;
};

const schoolNamesInCell = (dayName, hour) => {
  const s = summary.value;
  if (!s) return [];
  const names = new Set();
  for (const a of s.schoolAssignments || []) {
    if (String(a.dayOfWeek) !== dayName) continue;
    if (!overlapsHour(a.startTime, a.endTime, hour)) continue;
    const nm = String(a.schoolName || '').trim();
    if (nm) names.add(nm);
  }
  return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
};

const schoolShortLabel = (dayName, hour) => {
  const names = schoolNamesInCell(dayName, hour);
  if (!names.length) return 'School';
  if (names.length === 1) return names[0];
  return `${names[0]}+${names.length - 1}`;
};

const stateRank = (st) => {
  const v = String(st || '').toUpperCase();
  if (v === 'ASSIGNED_BOOKED') return 3;
  if (v === 'ASSIGNED_TEMPORARY') return 2;
  if (v === 'ASSIGNED_AVAILABLE') return 1;
  return 0;
};

const dayIndexForDateLocal = (dateYmd, ws) => {
  const a = new Date(`${String(ws).slice(0, 10)}T00:00:00`);
  const b = new Date(`${String(dateYmd).slice(0, 10)}T00:00:00`);
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
};

const officeState = (dayName, hour) => {
  const s = summary.value;
  if (!s) return '';
  let best = '';
  let bestRank = 0;
  for (const e of s.officeEvents || []) {
    const startRaw = String(e.startAt || '').trim();
    if (!startRaw) continue;
    const startLocal = new Date(startRaw.includes('T') ? startRaw : startRaw.replace(' ', 'T'));
    if (Number.isNaN(startLocal.getTime())) continue;
    // Align office-event day matching to the visible grid anchor (Monday-first weekStart).
    const idx = dayIndexForDateLocal(localYmd(startLocal), weekStart.value);
    const dn = ALL_DAYS[idx] || null;
    if (dn !== dayName) continue;
    if (startLocal.getHours() !== Number(hour)) continue;
    const r = stateRank(e.slotState);
    if (r > bestRank) {
      bestRank = r;
      best = String(e.slotState || '');
    }
  }
  return best;
};

const hasBusyIntervals = (busyList, dayName, hour, ws, minute = 0) => {
  for (const b of busyList || []) {
    const start = new Date(b.startAt);
    const end = new Date(b.endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    const idx = dayIndexForDateLocal(localYmd(start), ws);
    const dn = ALL_DAYS[idx] || null;
    // Also handle intervals that span days by checking the localYmd for the hour cell’s day.
    if (dn !== dayName && localYmd(end) !== localYmd(start)) {
      // fallthrough: we’ll rely on overlap check below using day boundary
    }

    // Check overlap against the cell’s local hour window.
    const cellDate = addDaysYmd(ws, dayIdxFromWeekStartMonday(dayName));
    const cellStart = new Date(`${cellDate}T${pad2(hour)}:${pad2(minute)}:00`);
    const cellEnd = new Date(cellStart.getTime() + ((showQuarterDetail.value ? 15 : 60) * 60 * 1000));
    if (end > cellStart && start < cellEnd) return true;
  }
  return false;
};
const busyRangeForCell = (busyList, dayName, hour, ws, minute = 0) => {
  if (ALL_DAYS.indexOf(String(dayName)) < 0) return null;
  const cellDate = addDaysYmd(ws, dayIdxFromWeekStartMonday(dayName));
  const cellStart = new Date(`${cellDate}T${pad2(hour)}:${pad2(minute)}:00`);
  const cellEnd = new Date(cellStart.getTime() + ((showQuarterDetail.value ? 15 : 60) * 60 * 1000));
  let minStart = null;
  let maxEnd = null;
  for (const b of busyList || []) {
    const start = new Date(b.startAt);
    const end = new Date(b.endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    if (!(end > cellStart && start < cellEnd)) continue;
    if (!minStart || start < minStart) minStart = start;
    if (!maxEnd || end > maxEnd) maxEnd = end;
  }
  if (!minStart || !maxEnd) return null;
  return { startAt: minStart.toISOString(), endAt: maxEnd.toISOString() };
};

const hasGoogleBusy = (dayName, hour, minute = 0) => {
  const s = summary.value;
  if (!s) return false;
  return hasBusyIntervals(s.googleBusy || [], dayName, hour, weekStart.value, minute);
};

const googleEventsInCell = (dayName, hour, minute = 0) => {
  const s = summary.value;
  if (!s) return [];
  const ws = weekStart.value;
  if (ALL_DAYS.indexOf(String(dayName)) < 0) return [];
  const cellDate = addDaysYmd(ws, dayIdxFromWeekStartMonday(dayName));
  const cellStart = new Date(`${cellDate}T${pad2(hour)}:${pad2(minute)}:00`);
  const cellEnd = new Date(cellStart.getTime() + ((showQuarterDetail.value ? 15 : 60) * 60 * 1000));
  const list = Array.isArray(s.googleEvents) ? s.googleEvents : [];
  const hits = [];
  for (const ev of list) {
    const st = new Date(ev.startAt);
    const en = new Date(ev.endAt);
    if (Number.isNaN(st.getTime()) || Number.isNaN(en.getTime())) continue;
    if (en > cellStart && st < cellEnd) hits.push(ev);
  }
  return hits;
};

const googleEventShortLabel = (ev) => {
  const s = String(ev?.summary || '').trim() || 'Event';
  const timing = quarterTimingFromRange(ev?.startAt, ev?.endAt);
  const withTiming = showQuarterDetail.value && timing ? `${timing} ${s}` : s;
  return withTiming.length > 22 ? `${withTiming.slice(0, 22)}…` : withTiming;
};
const googleEventTitle = (ev, dayName, hour) => {
  const s = String(ev?.summary || '').trim() || 'Google event';
  return `${s} — ${dayName} ${hourLabel(hour)}`;
};
const hasExternalBusy = (dayName, hour, minute = 0) => {
  const s = summary.value;
  if (!s) return false;
  const sel = selectedExternalCalendarIdSet.value;
  const cals = Array.isArray(s.externalCalendars) ? s.externalCalendars : [];
  for (const c of cals) {
    if (sel.size && !sel.has(Number(c?.id))) continue;
    if (hasBusyIntervals(c?.busy || [], dayName, hour, weekStart.value, minute)) return true;
  }
  return false;
};

const agenciesInCell = (kind, dayName, hour) => {
  const s = summary.value;
  if (!s) return [];
  const ws = weekStart.value;
  const ids = new Set();

  if (kind === 'request') {
    for (const r of s.officeRequests || []) {
      for (const slot of r.slots || []) {
        const dn = ALL_DAYS[((Number(slot.weekday) + 6) % 7)] || null;
        if (dn !== dayName) continue;
        if (Number(hour) >= Number(slot.startHour) && Number(hour) < Number(slot.endHour)) {
          if (r?._agencyId) ids.add(Number(r._agencyId));
        }
      }
    }
    for (const r of s.schoolRequests || []) {
      for (const b of r.blocks || []) {
        if (String(b.dayOfWeek) !== dayName) continue;
        if (overlapsHour(b.startTime, b.endTime, hour)) {
          if (r?._agencyId) ids.add(Number(r._agencyId));
        }
      }
    }
  }

  if (kind === 'school') {
    for (const a of s.schoolAssignments || []) {
      if (String(a.dayOfWeek) !== dayName) continue;
      if (overlapsHour(a.startTime, a.endTime, hour)) {
        if (a?._agencyId) ids.add(Number(a._agencyId));
      }
    }
  }

  if (kind === 'office') {
    for (const e of s.officeEvents || []) {
      const startRaw = String(e.startAt || '').trim();
      if (!startRaw) continue;
      const startLocal = new Date(startRaw.includes('T') ? startRaw : startRaw.replace(' ', 'T'));
      if (Number.isNaN(startLocal.getTime())) continue;
      const idx = dayIndexForDateLocal(localYmd(startLocal), ws);
      const dn = ALL_DAYS[idx] || null;
      if (dn !== dayName) continue;
      if (startLocal.getHours() !== Number(hour)) continue;
      if (e?._agencyId) ids.add(Number(e._agencyId));
    }
  }

  const out = Array.from(ids.values()).filter((n) => Number.isFinite(n) && n > 0);
  out.sort((a, b) => a - b);
  return out;
};

const agencySuffix = (ids) => {
  const list = (ids || [])
    .map((id) => agencyLabel(id) || `Agency ${id}`)
    .filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return ` (${list[0]})`;
  return ` (${list.slice(0, 2).join(', ')}${list.length > 2 ? ` +${list.length - 2}` : ''})`;
};

const requestTitle = (dayName, hour) => {
  const ids = agenciesInCell('request', dayName, hour);
  return `Pending request${agencySuffix(ids)} — ${dayName} ${hourLabel(hour)}`;
};
const schoolTitle = (dayName, hour) => {
  const ids = agenciesInCell('school', dayName, hour);
  const names = schoolNamesInCell(dayName, hour);
  const nameSuffix = names.length ? ` (${names.join(', ')})` : '';
  return `School assigned${agencySuffix(ids)}${nameSuffix} — ${dayName} ${hourLabel(hour)}`;
};
const officeEventsInCell = (dayName, hour, minute = 0) => {
  const s = summary.value;
  if (!s) return [];
  const ws = weekStart.value;
  if (ALL_DAYS.indexOf(String(dayName)) < 0) return [];
  const cellDate = addDaysYmd(ws, dayIdxFromWeekStartMonday(dayName));
  const cellStart = new Date(`${cellDate}T${pad2(hour)}:${pad2(minute)}:00`);
  const cellEnd = new Date(cellStart.getTime() + ((showQuarterDetail.value ? 15 : 60) * 60 * 1000));
  const hits = (s?.officeEvents || []).filter((e) => {
    const startRaw = String(e.startAt || '').trim();
    if (!startRaw) return false;
    const startLocal = new Date(startRaw.includes('T') ? startRaw : startRaw.replace(' ', 'T'));
    if (Number.isNaN(startLocal.getTime())) return false;
    const endRaw = String(e.endAt || '').trim();
    const endLocal = endRaw
      ? new Date(endRaw.includes('T') ? endRaw : endRaw.replace(' ', 'T'))
      : new Date(startLocal.getTime() + (60 * 60 * 1000));
    if (Number.isNaN(endLocal.getTime())) return false;
    return endLocal > cellStart && startLocal < cellEnd;
  });
  return hits;
};

const officeTopEvent = (dayName, hour, officeIdFilter = null, roomIdFilter = null, minute = 0) => {
  let hits = officeEventsInCell(dayName, hour, minute);
  if (officeIdFilter != null && Number(officeIdFilter) > 0) {
    hits = hits.filter((e) => Number(e?.buildingId || 0) === Number(officeIdFilter));
  }
  if (roomIdFilter != null && Number(roomIdFilter) > 0) {
    hits = hits.filter((e) => Number(e?.roomId || 0) === Number(roomIdFilter));
  }
  const top = hits.sort((a, b) => stateRank(b.slotState) - stateRank(a.slotState))[0] || null;
  return top;
};

const schoolAssignmentsInCell = (dayName, hour) => {
  const s = summary.value;
  if (!s) return [];
  return (s.schoolAssignments || []).filter((a) => {
    if (String(a.dayOfWeek) !== dayName) return false;
    return overlapsHour(a.startTime, a.endTime, hour);
  });
};

const portalIntakeInCell = (dayName, hour, minute = 0) => {
  const s = summary.value;
  if (!s) return [];
  const rows = Array.isArray(s.virtualWorkingHours) ? s.virtualWorkingHours : [];
  if (!rows.length) return [];
  const slotMinutes = showQuarterDetail.value ? 15 : 60;
  const cellStart = (Number(hour) * 60) + Number(minute || 0);
  const cellEnd = cellStart + slotMinutes;
  const toMin = (t) => {
    const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return (Number(m[1]) * 60) + Number(m[2]);
  };
  return rows.filter((row) => {
    if (String(row?.dayOfWeek || '') !== String(dayName || '')) return false;
    const sessionType = String(row?.sessionType || '').toUpperCase();
    if (!['INTAKE', 'BOTH'].includes(sessionType)) return false;
    const startMin = toMin(String(row?.startTime || '').slice(0, 5));
    const endMin = toMin(String(row?.endTime || '').slice(0, 5));
    if (startMin == null || endMin == null) return false;
    return endMin > cellStart && startMin < cellEnd;
  });
};

const supervisionSessionsInCell = (dayName, hour, minute = 0) => {
  const s = summary.value;
  if (!s) return [];
  const ws = s.weekStart || weekStart.value;
  if (ALL_DAYS.indexOf(String(dayName)) < 0) return [];
  const cellDate = addDaysYmd(ws, dayIdxFromWeekStartMonday(dayName));
  const cellStart = new Date(`${cellDate}T${pad2(hour)}:${pad2(minute)}:00`);
  const cellEnd = new Date(cellStart.getTime() + ((showQuarterDetail.value ? 15 : 60) * 60 * 1000));
  const hits = [];
  for (const ev of s.supervisionSessions || []) {
    const startRaw = String(ev.startAt || '').trim();
    const endRaw = String(ev.endAt || '').trim();
    if (!startRaw || !endRaw) continue;
    const startLocal = new Date(startRaw.includes('T') ? startRaw : startRaw.replace(' ', 'T'));
    const endLocal = new Date(endRaw.includes('T') ? endRaw : endRaw.replace(' ', 'T'));
    if (Number.isNaN(startLocal.getTime()) || Number.isNaN(endLocal.getTime())) continue;
    const dateYmd = supervisionDateYmd(ev);
    if (!dateYmd) continue;
    const sessionDay = supervisionDayName(ev);
    if (sessionDay !== dayName && typeof window !== 'undefined') {
      const key = `supv-day-mismatch-${String(ev?.id || 'x')}-${dayName}-${hour}-${minute}`;
      window.__supvDayMismatchLogOnce = window.__supvDayMismatchLogOnce || {};
      if (!window.__supvDayMismatchLogOnce[key]) {
        window.__supvDayMismatchLogOnce[key] = true;
      }
    }
    if (sessionDay !== dayName) continue;
    if (endLocal > cellStart && startLocal < cellEnd) hits.push(ev);
  }
  return hits;
};

const requestsInCell = (dayName, hour) => {
  const s = summary.value;
  if (!s) return [];
  const out = [];
  for (const r of s.officeRequests || []) {
    for (const slot of r.slots || []) {
      const dn = ALL_DAYS[((Number(slot.weekday) + 6) % 7)] || null;
      if (dn !== dayName) continue;
      if (Number(hour) >= Number(slot.startHour) && Number(hour) < Number(slot.endHour)) {
        out.push(r);
        break;
      }
    }
  }
  for (const r of s.schoolRequests || []) {
    for (const b of r.blocks || []) {
      if (String(b.dayOfWeek) !== dayName) continue;
      if (overlapsHour(b.startTime, b.endTime, hour)) {
        out.push(r);
        break;
      }
    }
  }
  return out;
};
const officeTitle = (dayName, hour, topEvent = null) => {
  const top = topEvent || officeTopEvent(dayName, hour);
  if (!top) return `Office — ${dayName} ${hourLabel(hour)}`;
  const roomNumber = String(top.roomNumber || '').trim();
  const roomLabel = String(top.roomLabel || '').trim();
  const room = roomNumber ? `#${roomNumber}${roomLabel ? ` (${roomLabel})` : ''}` : (roomLabel || 'Office');
  const bld = top.buildingName || 'Office location';
  const st = String(top.slotState || '').toUpperCase();
  const label = st === 'ASSIGNED_BOOKED' ? 'Booked' : st === 'ASSIGNED_TEMPORARY' ? 'Temporary' : 'Assigned';
  const ids = agenciesInCell('office', dayName, hour);
  return `${label}${agencySuffix(ids)} — ${bld} • ${room} — ${dayName} ${hourLabel(hour)}`;
};
const googleBusyTitle = (dayName, hour) => `Google busy — ${dayName} ${hourLabel(hour)}`;
const externalIcsEventsInCell = (dayName, hour, minute = 0) => {
  const s = summary.value;
  if (!s) return [];
  const ws = weekStart.value;
  if (ALL_DAYS.indexOf(String(dayName)) < 0) return [];
  const cellDate = addDaysYmd(ws, dayIdxFromWeekStartMonday(dayName));
  const cellStart = new Date(`${cellDate}T${pad2(hour)}:${pad2(minute)}:00`);
  const cellEnd = new Date(cellStart.getTime() + ((showQuarterDetail.value ? 15 : 60) * 60 * 1000));
  const sel = selectedExternalCalendarIdSet.value;
  const cals = Array.isArray(s.externalCalendars) ? s.externalCalendars : [];
  const hits = [];
  for (const c of cals) {
    if (sel.size && !sel.has(Number(c?.id))) continue;
    const calLabel = String(c?.label || '').trim() || 'Calendar';
    const raw = Array.isArray(c?.events) && c.events.length ? c.events : (Array.isArray(c?.busy) ? c.busy : []);
    for (const ev of raw) {
      const st = new Date(ev.startAt);
      const en = new Date(ev.endAt);
      if (Number.isNaN(st.getTime()) || Number.isNaN(en.getTime())) continue;
      if (!(en > cellStart && st < cellEnd)) continue;
      hits.push({
        calendarLabel: calLabel,
        summary: String(ev?.summary || '').trim(),
        startAt: ev.startAt,
        endAt: ev.endAt
      });
    }
  }
  hits.sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
  return hits;
};

const externalBusyLabels = (dayName, hour) => {
  const s = summary.value;
  if (!s) return [];
  const sel = selectedExternalCalendarIdSet.value;
  const cals = Array.isArray(s.externalCalendars) ? s.externalCalendars : [];
  const labels = [];
  for (const c of cals) {
    if (sel.size && !sel.has(Number(c?.id))) continue;
    const label = String(c?.label || '').trim();
    if (!label) continue;
    if (hasBusyIntervals(c?.busy || [], dayName, hour, weekStart.value)) labels.push(label);
  }
  return labels;
};
const externalBusyTitle = (dayName, hour, minute = 0) => {
  const labels = externalBusyLabels(dayName, hour);
  const labelSuffix = labels.length ? ` (${labels.join(', ')})` : '';
  const timeLabel = showQuarterDetail.value ? slotClockLabel(dayName, hour, minute) : hourLabel(hour);
  if (!hideExternalIcsTitles.value) {
    const hits = externalIcsEventsInCell(dayName, hour, minute);
    const summaries = [...new Set(hits.map((h) => h.summary).filter(Boolean))];
    if (summaries.length === 1) {
      return `${summaries[0]}${labelSuffix} — ${dayName} ${timeLabel}`;
    }
    if (summaries.length > 1) {
      const joined = summaries.join('; ');
      const clipped = joined.length > 100 ? `${joined.slice(0, 100)}…` : joined;
      return `${clipped}${labelSuffix} — ${dayName} ${timeLabel}`;
    }
  }
  return `Therapy Notes busy${labelSuffix} — ${dayName} ${timeLabel}`;
};

const externalBusyShortLabel = (dayName, hour, minute = 0) => {
  const labels = externalBusyLabels(dayName, hour);
  const prefix = showQuarterDetail.value ? slotClockLabel(dayName, hour, minute) : '';
  if (!hideExternalIcsTitles.value) {
    const hits = externalIcsEventsInCell(dayName, hour, minute);
    const summaries = [...new Set(hits.map((h) => h.summary).filter(Boolean))];
    if (summaries.length) {
      const singleDayFocused = visibleDays.value.length === 1;
      let text =
        singleDayFocused || summaries.length === 1
          ? summaries[0]
          : `${summaries[0]}+${summaries.length - 1}`;
      if (text.length > 28) text = `${text.slice(0, 28)}…`;
      return prefix ? `${prefix} ${text}` : text;
    }
  }
  if (!labels.length) return prefix ? `${prefix} Busy` : 'Busy';
  const singleDayFocused = visibleDays.value.length === 1;
  const base = singleDayFocused
    ? labels.join(', ')
    : (labels.length === 1 ? labels[0] : `${labels[0]}+${labels.length - 1}`);
  const clippedBase = base.length > 28 ? `${base.slice(0, 28)}…` : base;
  return prefix ? `${prefix} ${clippedBase}` : clippedBase;
};

const shortOfficeLabel = (topEvent, fallback) => {
  const roomNumber = String(topEvent?.roomNumber || '').trim();
  if (roomNumber) return `#${roomNumber}`;
  const roomLabel = String(topEvent?.roomLabel || '').trim();
  if (roomLabel) return roomLabel.length > 12 ? `${roomLabel.slice(0, 12)}…` : roomLabel;
  return fallback;
};

const cellBlocks = (dayName, hour, minute = 0) => {
  const blocks = [];
  const singleDayFocused = visibleDays.value.length === 1;
  const perTypeInlineLimit = singleDayFocused ? Number.MAX_SAFE_INTEGER : 2;

  // Office assignment blocks: All offices, one building, or Off.
  const selectedOfficeId = Number(selectedOfficeLocationId.value || 0);
  const officeHits = selectedOfficeId === OFFICE_SCOPE_OFF
    ? []
    : selectedOfficeId === OFFICE_SCOPE_ALL
      ? officeEventsInCell(dayName, hour, minute)
      : officeEventsInCell(dayName, hour, minute).filter((e) => Number(e?.buildingId || 0) === selectedOfficeId);
  const officeByKey = new Map();
  for (const e of officeHits) {
    const aid = Number(e?._agencyId || 0) || null;
    const bid = Number(e?.buildingId || 0) || 0;
    const rid = Number(e?.roomId || 0) || 0;
    const key = selectedOfficeId === OFFICE_SCOPE_ALL
      ? `${aid || 'none'}|${bid}|${rid}`
      : `${aid || 'none'}`;
    if (!officeByKey.has(key)) officeByKey.set(key, []);
    officeByKey.get(key).push(e);
  }
  for (const [, events] of officeByKey) {
    const top = events.sort((a, b) => stateRank(b.slotState) - stateRank(a.slotState))[0] || null;
    const agencyId = Number(top?._agencyId || 0) || null;
    const buildingId = top?.buildingId ? Number(top.buildingId) : null;
    const roomId = top?.roomId ? Number(top.roomId) : null;
    const buildingPrefix = selectedOfficeId === OFFICE_SCOPE_ALL && buildingId
      ? `${officeBuildingShortName(buildingId)} `
      : '';
    const intakeSuffix = [
      top?.inPersonIntakeEnabled ? ' IP' : '',
      top?.virtualIntakeEnabled ? ' VI' : ''
    ].join('');
    const st = String(top?.slotState || '').toUpperCase();
    const blockKeySuffix = `${agencyId || 'x'}-${buildingId || 0}-${roomId || 0}`;
    const roomShort = shortOfficeLabel(top, 'Office');
    const officeRoomLabel = `${buildingPrefix}${roomShort}${intakeSuffix}`.trim();
    if (st === 'ASSIGNED_BOOKED') {
      const bookedLabel = colorBlocksByTenant.value
        ? `Booked · ${roomShort}`
        : roomShort || 'Booked';
      blocks.push({
        key: `office-booked-${blockKeySuffix}`,
        kind: 'ob',
        isOfficeBlock: true,
        officeStatus: 'booked',
        officeStatusLabel: 'Office reserved',
        officeRoomLabel,
        shortLabel: `${buildingPrefix}${bookedLabel}${intakeSuffix}`,
        title: officeTitle(dayName, hour, top),
        buildingId,
        agencyId,
        roomId
      });
    } else if (st === 'ASSIGNED_TEMPORARY') {
      const tempLabel = colorBlocksByTenant.value
        ? `Temp · ${roomShort}`
        : roomShort || 'Temp';
      blocks.push({
        key: `office-temp-${blockKeySuffix}`,
        kind: 'ot',
        isOfficeBlock: true,
        officeStatus: 'temp',
        officeStatusLabel: 'Temp hold',
        officeRoomLabel,
        shortLabel: `${buildingPrefix}${tempLabel}${intakeSuffix}`,
        title: officeTitle(dayName, hour, top),
        buildingId,
        agencyId,
        roomId
      });
    } else if (st === 'ASSIGNED_AVAILABLE') {
      const assignedLabel = colorBlocksByTenant.value
        ? `Assigned · ${roomShort}`
        : roomShort || 'Office';
      blocks.push({
        key: `office-assigned-${blockKeySuffix}`,
        kind: 'oa',
        isOfficeBlock: true,
        officeStatus: 'reserved',
        officeStatusLabel: 'Office reserved',
        officeEmpty: true,
        officeRoomLabel,
        shortLabel: `${buildingPrefix}${assignedLabel}${intakeSuffix}`,
        title: officeTitle(dayName, hour, top),
        buildingId,
        agencyId,
        roomId
      });
    }
  }
  const top = officeHits.sort((a, b) => stateRank(b.slotState) - stateRank(a.slotState))[0] || null;
  if (top?.inPersonIntakeEnabled) {
    blocks.push({ key: 'intake-ip', kind: 'intake-ip', shortLabel: 'IP', title: `In-person intake enabled — ${officeTitle(dayName, hour, top)}`, agencyId: Number(top?._agencyId || 0) || null, buildingId: top?.buildingId ? Number(top.buildingId) : null, roomId: top?.roomId ? Number(top.roomId) : null });
  }
  if (top?.virtualIntakeEnabled) {
    blocks.push({ key: 'intake-vi', kind: 'intake-vi', shortLabel: 'VI', title: `Virtual intake enabled — ${officeTitle(dayName, hour, top)}`, agencyId: Number(top?._agencyId || 0) || null, buildingId: top?.buildingId ? Number(top.buildingId) : null, roomId: top?.roomId ? Number(top.roomId) : null });
  }

  // Portal intake ("Open for new clients") — virtual working hours with INTAKE/BOTH
  const portalHits = portalIntakeInCell(dayName, hour, minute);
  const portalByAgency = new Map();
  for (const row of portalHits) {
    const aid = Number(row?.agencyId || row?._agencyId || 0) || null;
    const key = aid || 'none';
    if (!portalByAgency.has(key)) portalByAgency.set(key, row);
  }
  for (const [aid, row] of portalByAgency) {
    const agencyId = (aid === 'none' || !aid) ? null : Number(aid);
    const label = agencyId && colorBlocksByTenant.value
      ? `Open · ${agencyLabel(agencyId) || 'Portal'}`
      : 'Open';
    blocks.push({
      key: `portal-${agencyId || 'x'}`,
      kind: 'portal',
      shortLabel: singleDayFocused
        ? (label.length > 22 ? `${label.slice(0, 22)}…` : label)
        : (agencyId ? 'Open' : 'Open'),
      title: `Open for new clients${agencySuffix(agencyId ? [agencyId] : [])} — ${dayName} ${String(row?.startTime || '').slice(0, 5)}–${String(row?.endTime || '').slice(0, 5)}`,
      agencyId,
      startTime: row?.startTime || null,
      endTime: row?.endTime || null
    });
  }

  // Assigned school — one block per agency
  const schoolHits = schoolAssignmentsInCell(dayName, hour);
  const schoolByAgency = new Map();
  for (const a of schoolHits) {
    const aid = Number(a?._agencyId || 0) || null;
    const key = aid || 'none';
    if (!schoolByAgency.has(key)) schoolByAgency.set(key, []);
    schoolByAgency.get(key).push(a);
  }
  for (const [aid, assignments] of schoolByAgency) {
    const agencyId = (aid === 'none' || !aid) ? null : Number(aid);
    const names = assignments.flatMap((a) => (a?.schoolName ? [String(a.schoolName).trim()] : [])).filter(Boolean);
    const shortLabel = singleDayFocused
      ? ((names.join(', ') || 'School').length > 28 ? `${(names.join(', ') || 'School').slice(0, 28)}…` : (names.join(', ') || 'School'))
      : (names.length <= 1 ? (names[0] || 'School') : `${names[0]}+${names.length - 1}`);
    const ids = agencyId ? [agencyId] : [];
    blocks.push({ key: `school-${agencyId || 'x'}`, kind: 'school', shortLabel, title: `School assigned${agencySuffix(ids)} — ${dayName} ${hourLabel(hour)}`, agencyId });
  }

  // Supervision sessions — one block per agency
  const supvHits = supervisionSessionsInCell(dayName, hour, minute);
  const supvByAgency = new Map();
  for (const ev of supvHits) {
    const aid = Number(ev?._agencyId || 0) || null;
    const key = aid || 'none';
    if (!supvByAgency.has(key)) supvByAgency.set(key, []);
    supvByAgency.get(key).push(ev);
  }
  for (const [aid, events] of supvByAgency) {
    const agencyId = (aid === 'none' || !aid) ? null : Number(aid);
    const sortedEvents = [...events].sort((a, b) => String(a?.startAt || '').localeCompare(String(b?.startAt || '')));
    const first = sortedEvents[0] || null;
    const last = sortedEvents[sortedEvents.length - 1] || null;
    const segmentClass = quarterSegmentForRange(dayName, hour, minute, first?.startAt, last?.endAt);
    const showLabel = shouldShowQuarterBlockLabel(segmentClass, minute);
    blocks.push({
      key: `supv-${agencyId || 'x'}`,
      kind: 'supv',
      shortLabel: showLabel ? supervisionLabel(dayName, hour) : '',
      title: supervisionTitle(dayName, hour),
      agencyId,
      segmentClass,
      hideAgencyDot: shouldHideQuarterAgencyDot(segmentClass, minute)
    });
  }

  // App-scheduled provider events (personal/hold/indirect) — include agencyId per event
  const scheduleHits = scheduleEventsInCell(dayName, hour, minute).slice(0, perTypeInlineLimit);
  for (const ev of scheduleHits) {
    const segmentClass = quarterSegmentForRange(dayName, hour, minute, ev?.startAt, ev?.endAt);
    const showLabel = shouldShowQuarterBlockLabel(segmentClass, minute);
    blocks.push({
      key: `sevt-${String(ev?.id || ev?.googleEventId || ev?.title || 'event')}`,
      kind: 'sevt',
      eventKind: String(ev?.kind || '').trim().toUpperCase(),
      shortLabel: showLabel ? scheduleEventShortLabel(ev) : '',
      title: scheduleEventBlockTitle(ev, dayName, hour),
      link: String(ev?.htmlLink || '').trim() || null,
      appJoinUrl: String(ev?.appJoinUrl || '').trim() || null,
      eventId: Number(ev?.id || 0) || null,
      agencyId: Number(ev?._agencyId || 0) || null,
      segmentClass,
      hideAgencyDot: shouldHideQuarterAgencyDot(segmentClass, minute)
    });
  }
  const scheduleExtra = Math.max(0, scheduleEventsInCell(dayName, hour, minute).length - scheduleHits.length);
  if (scheduleExtra) {
    blocks.push({ key: 'sevt-more', kind: 'more', shortLabel: `+${scheduleExtra}`, title: `${scheduleExtra} more schedule events in this hour` });
  }

  // Pending request — one block per agency
  const reqHits = requestsInCell(dayName, hour);
  const reqByAgency = new Map();
  for (const r of reqHits) {
    const aid = Number(r?._agencyId || 0) || null;
    const key = aid || 'none';
    if (!reqByAgency.has(key)) reqByAgency.set(key, []);
    reqByAgency.get(key).push(r);
  }
  for (const [aid] of reqByAgency) {
    const agencyId = (aid === 'none' || !aid) ? null : Number(aid);
    blocks.push({ key: `request-${agencyId || 'x'}`, kind: 'request', shortLabel: 'Req', title: requestTitle(dayName, hour), agencyId });
  }

  // Busy overlays
  if (showGoogleBusy.value && hasGoogleBusy(dayName, hour, minute)) {
    const ws = summary.value?.weekStart || weekStart.value;
    const range = busyRangeForCell(summary.value?.googleBusy || [], dayName, hour, ws, minute);
    const segmentClass = range ? quarterSegmentForRange(dayName, hour, minute, range.startAt, range.endAt) : 'single';
    const showLabel = shouldShowQuarterBlockLabel(segmentClass, minute);
    blocks.push({
      key: 'gbusy',
      kind: 'gbusy',
      shortLabel: showLabel ? 'G' : '',
      title: googleBusyTitle(dayName, hour),
      segmentClass
    });
  }
  if (showGoogleEvents.value) {
    const events = googleEventsInCell(dayName, hour, minute).slice(0, perTypeInlineLimit);
    for (const ev of events) {
      const segmentClass = quarterSegmentForRange(dayName, hour, minute, ev?.startAt, ev?.endAt);
      const showLabel = shouldShowQuarterBlockLabel(segmentClass, minute);
      blocks.push({
        key: `gevt-${String(ev?.id || ev?.summary || 'event')}`,
        kind: 'gevt',
        shortLabel: showLabel ? googleEventShortLabel(ev) : '',
        title: googleEventTitle(ev, dayName, hour),
        link: String(ev?.htmlLink || '').trim() || null,
        segmentClass
      });
    }
    const extra = Math.max(0, googleEventsInCell(dayName, hour, minute).length - events.length);
    if (extra) {
      blocks.push({ key: 'gevt-more', kind: 'more', shortLabel: `+${extra}`, title: `${extra} more Google events in this hour` });
    }
  }
  if (showExternalBusy.value && selectedExternalCalendarIds.value.length && hasExternalBusy(dayName, hour, minute)) {
    const ws = summary.value?.weekStart || weekStart.value;
    const selected = new Set((selectedExternalCalendarIds.value || []).map((v) => Number(v)).filter((v) => Number.isFinite(v)));
    const cals = Array.isArray(summary.value?.externalCalendars) ? summary.value.externalCalendars : [];
    const busyList = cals
      .filter((c) => selected.size === 0 || selected.has(Number(c?.id)))
      .flatMap((c) => (Array.isArray(c?.busy) ? c.busy : []));
    const range = busyRangeForCell(busyList, dayName, hour, ws, minute);
    const segmentClass = range ? quarterSegmentForRange(dayName, hour, minute, range.startAt, range.endAt) : 'single';
    const showLabel = shouldShowQuarterBlockLabel(segmentClass, minute);
    blocks.push({
      key: 'ebusy',
      kind: 'ebusy',
      shortLabel: showLabel ? externalBusyShortLabel(dayName, hour, minute) : '',
      title: externalBusyTitle(dayName, hour, minute),
      segmentClass
    });
  }

  if (showPeerBusyOverlay.value) {
    const ws = summary.value?.weekStart || weekStart.value;
    for (const uid of peerBusySelectedIds.value || []) {
      const typedHits = peerTypedBlocksInCell(uid, dayName, hour, ws, minute);
      if (!typedHits.length) continue;
      const top = typedHits[0];
      const activityType = String(top?.activityType || 'busy').toLowerCase();
      const typeShort = peerActivityShortLabel(activityType);
      const officeBit = String(top?.officeLabel || '').trim();
      const range = busyRangeForCell(typedHits, dayName, hour, ws, minute);
      const segmentClass = range ? quarterSegmentForRange(dayName, hour, minute, range.startAt, range.endAt) : 'single';
      const showLabel = shouldShowQuarterBlockLabel(segmentClass, minute);
      const labelCore = activityType === 'session' && officeBit
        ? `${typeShort} · ${officeBit.length > 14 ? `${officeBit.slice(0, 14)}…` : officeBit}`
        : typeShort;
      const peerName = peerLabelById(uid);
      const titleLines = typedHits.map((h) => String(h?.title || typeShort).trim()).filter(Boolean);
      const title = `${peerName} — ${titleLines.join(' · ')}${typedHits.length > 1 ? ` (+${typedHits.length - 1})` : ''}`;
      const agencyId = Number(top?.agencyId || 0) || null;
      const peerRow = (peerBusyCandidates.value || []).find((p) => Number(p.id) === Number(uid));
      blocks.push({
        key: `peerbusy-${uid}-${activityType}`,
        kind: 'peerbusy',
        peerActivityType: activityType,
        peerUserId: Number(uid),
        peerPhotoUrl: String(peerRow?.profilePhotoUrl || '').trim() || null,
        peerInteractive: !!canManagePeerCalendar.value,
        shortLabel: showLabel ? labelCore : '',
        title,
        agencyId,
        hideAgencyDot: shouldHideQuarterAgencyDot(segmentClass, minute),
        eventId: Number(top?.eventId || top?.id || 0) || null,
        eventKind: String(top?.eventKind || '').toUpperCase() || null,
        buildingId: Number(top?.buildingId || 0) || null,
        roomId: Number(top?.roomId || 0) || null,
        segmentClass,
        peerOnly: !canManagePeerCalendar.value,
        peerActivities: typedHits
      });
    }
  }

  // Week grid: fold pending requests into a primary assigned block (school/office)
  // so the same hour isn't split into two competing columns (e.g. Hogwarts | Req).
  const PRIMARY_OVERLAP_KINDS = new Set(['school', 'ob', 'ot', 'oa']);
  const requestBlocks = blocks.filter((b) => b.kind === 'request');
  const primaryBlock = blocks.find((b) => PRIMARY_OVERLAP_KINDS.has(b.kind));
  let displayBlocks = blocks;
  if (!singleDayFocused && primaryBlock && requestBlocks.length) {
    primaryBlock.hasPendingRequest = true;
    primaryBlock.pendingRequestCount = requestBlocks.length;
    const reqHint = requestBlocks.length === 1
      ? 'Pending request in this slot'
      : `${requestBlocks.length} pending requests in this slot`;
    primaryBlock.title = `${primaryBlock.title} · ${reqHint}`;
    displayBlocks = blocks.filter((b) => b.kind !== 'request');
  }

  // Side-by-side if multiple; keep it readable: show at most 3 blocks, then "+N".
  if (!singleDayFocused && displayBlocks.length > 3) {
    const extra = displayBlocks.length - 2;
    return [
      displayBlocks[0],
      displayBlocks[1],
      { key: 'more', kind: 'more', shortLabel: `+${extra}`, title: `${extra} more items in this hour` }
    ];
  }
  return displayBlocks;
};

const isCellVisuallyBlank = (dayName, hour) => cellBlocks(dayName, hour).length === 0;

const overlayErrorText = computed(() => {
  const s = summary.value;
  if (!s) return '';
  const googleErr = showGoogleBusy.value ? String(s?.googleBusyError || '').trim() : '';
  const googleEventsErr = showGoogleEvents.value ? String(s?.googleEventsError || '').trim() : '';
  const cals = Array.isArray(s.externalCalendars) ? s.externalCalendars : [];
  const errors = (cals || [])
    .map((c) => ({ label: String(c?.label || '').trim(), err: String(c?.error || '').trim() }))
    .filter((x) => x.err)
    .slice(0, 2);
  const parts = [];
  if (googleErr) parts.push(`Google busy: ${googleErr}`);
  if (googleEventsErr) parts.push(`Google events: ${googleEventsErr}`);
  if (errors.length) parts.push(`Therapy Notes: ${errors.map((e) => (e.label ? `${e.label}: ${e.err}` : e.err)).join(' • ')}`);
  return parts.length ? `Calendar overlay error: ${parts.join(' • ')}` : '';
});

const selectedActionSlots = ref([]);
const selectedBlockKey = ref(''); // legacy, used for selection context
const hoveredBlockKey = ref(''); // `${dayName}|${hour}|${block.key}` – which block is hovered (highlight)
const lastSelectedActionKey = ref('');
const isCellDragSelecting = ref(false);
const dragAnchorSlot = ref(null);
const suppressClickAfterDrag = ref(false);
const mouseDownClient = ref({ x: 0, y: 0 });
const DRAG_THRESHOLD_PX = 8;
const lastAutoOpenedSelectionSignature = ref('');
const mouseDownCellKey = ref('');
const selectedActionKeys = computed(() => selectedActionSlots.value.map((x) => x.key));
const selectedActionCount = computed(() => selectedActionSlots.value.length);
const selectedActionKeySet = computed(() => new Set(selectedActionKeys.value));
const isActionCellSelected = (dayName, hour) => {
  const dateYmd = addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dayName));
  const key = `${String(dateYmd).slice(0, 10)}|${Number(hour)}|0`;
  return selectedActionKeySet.value.has(key);
};

const blockKey = (dayName, hour, block) => `${String(dayName || '')}|${Number(hour)}|${String(block?.key || '')}`;
const isBlockHovered = (dayName, hour, block) => hoveredBlockKey.value === blockKey(dayName, hour, block);
const clearSelectedActionSlots = () => {
  selectedActionSlots.value = [];
  selectedBlockKey.value = '';
  hoveredBlockKey.value = '';
  lastSelectedActionKey.value = '';
  dragAnchorSlot.value = null;
  suppressClickAfterDrag.value = false;
  lastAutoOpenedSelectionSignature.value = '';
  mouseDownCellKey.value = '';
};

// ---- In-grid request creation (self mode) ----
const showRequestModal = ref(false);
// Keep modal “Schedule for” in sync when parent changes the viewed user (declared after showRequestModal to avoid TDZ).
watch(() => props.userId, (uid) => {
  const id = Number(uid || 0);
  if (id > 0 && showRequestModal.value) {
    bookingTargetUserId.value = id;
  }
});
const showSlotInfoModal = ref(false);
const slotInfoModalData = ref(null);
const modalDay = ref('Monday');
const modalHour = ref(7);
const modalStartHour = ref(7);
const modalEndHour = ref(8);
const modalStartMinute = ref(0);
const modalEndMinute = ref(0);
const requestType = ref(''); // selected action in request modal
const requestTypeChosenByUser = ref(false);
const modalActionSource = ref('general'); // general | plus_or_blank | office_block | other_block
const requestNotes = ref('');
const submitting = ref(false);
const modalError = ref('');
const SCHEDULE_EVENT_ACTIONS = new Set(['personal_event', 'schedule_hold', 'schedule_hold_all_day', 'indirect_services', 'agency_meeting', 'huddle']);
const AGENCY_OPTIONAL_ACTIONS = new Set([
  'office',
  // individual_session / group_session require an agency (clients, medical billing, video room)
  'unbook_slot',
  'forfeit_slot',
  'personal_event',
  'schedule_hold',
  'schedule_hold_all_day',
  'slot_details',
  'cancel_booking',
  'admin_assign',
  'extend_assignment'
]);
const SESSION_BOOKING_ACTIONS = new Set(['individual_session', 'group_session', 'portal_intake']);

const officeSlotStatusLabel = (rawState) => {
  const st = String(rawState || '').trim().toUpperCase();
  if (st === 'ASSIGNED_AVAILABLE') return 'Assigned (open to book)';
  if (st === 'ASSIGNED_TEMPORARY') return 'Temporary assignment';
  if (st === 'ASSIGNED_BOOKED') return 'Booked';
  if (st === 'COMPANY_HOLD') return 'Company hold';
  if (st === 'OPEN') return 'Open';
  if (st === 'CONFLICT') return 'Conflict';
  if (!st) return '';
  return st.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
};
const SCHEDULE_HOLD_REASON_OPTIONS = [
  { code: 'DOCUMENTATION', label: 'Documentation' },
  { code: 'TEAM_MEETING', label: 'Team meeting' },
  { code: 'TRAINING', label: 'Training' },
  { code: 'ADMIN', label: 'Administrative time' },
  { code: 'CUSTOM', label: 'Custom reason' }
];
const scheduleEventTitle = ref('');
/** 0 = none / all orgs (agency_id null); >0 = specific tenant */
const scheduleEventAgencyScope = ref(0);
const scheduleEventAllDay = ref(false);
const scheduleEventPrivate = ref(false);
const scheduleEventRecurrence = ref('ONCE'); // ONCE | WEEKLY | BIWEEKLY | MONTHLY (meeting/huddle only)
const scheduleEventRecurrenceEndMode = ref('count'); // count | indefinite
const scheduleEventOccurrenceCount = ref(6); // 1–104 for recurring meeting/huddle
const supervisionRecurrence = ref('ONCE');
const supervisionRecurrenceEndMode = ref('count'); // count | indefinite
const supervisionOccurrenceCount = ref(6);
const scheduleHoldReasonCode = ref('DOCUMENTATION');
const scheduleHoldCustomReason = ref('');
const normalizeCodeValue = (value) => String(value || '').trim().toUpperCase();
const DEFAULT_BOOKING_TYPE = 'SESSION';

// Office booking request (office-schedule/booking-requests)
const officeBookingRecurrence = ref('ONCE'); // ONCE | WEEKLY | BIWEEKLY | MONTHLY
const officeBookingOccurrenceCount = ref(6); // 1–104 when recurrence is WEEKLY/BIWEEKLY/MONTHLY
const selectedOfficeRoomId = ref(0); // 0 = any open room
const intakeConfirmStep = ref(null); // 'ask_inperson' | 'ask_virtual' | null – confirmation before intake submit
const intakeConfirmChoice = ref(null); // 'both' | 'ip_only' | 'vi_yes' – set by confirm buttons, read by submit
const forfeitScope = ref('occurrence'); // 'occurrence' | 'future'
const ackForfeit = ref(false);
const bookingMetadataLoading = ref(false);
const bookingMetadataError = ref('');
const bookingMetadata = ref({
  appointmentTypes: [],
  appointmentSubtypes: [],
  serviceCodes: [],
  serviceLocations: []
});
const bookingAppointmentType = ref(DEFAULT_BOOKING_TYPE);
const bookingAppointmentSubtype = ref('');
const bookingServiceCode = ref('');
const bookingServiceLocationId = ref(0);
const bookingUnitPreview = ref('');
let bookingUnitPreviewTimer = null;
const bookingModality = ref('');
/** When booking a virtual individual session with an office selected, optionally also submit an office request. */
const sessionAlsoRequestOffice = ref(false);
/** Link schedule block to platform counseling video room (Vonage). */
const linkPlatformVideoRoom = ref(true);
const virtualSessionParticipantSearch = ref('');
const virtualSessionSelectedClientIds = ref([]);
const virtualSessionSelectedGuardianKeys = ref([]);
const virtualSessionIncludeGuardians = ref(false);
const virtualSessionClients = ref([]);
const virtualSessionGuardians = ref([]);
const virtualSessionClientsLoading = ref(false);
const virtualSessionShareUrl = ref('');
const virtualSessionShareCopied = ref(false);
const virtualSessionScheduledSessionKey = ref('');
const virtualSessionGoogleWarning = ref('');
const modalContext = ref({
  officeEventId: null,
  officeLocationId: null,
  roomId: null,
  assignedProviderId: null,
  assignedFrequency: null,
  bookedFrequency: null,
  frequencyLabel: null,
  assignmentAvailableSinceDate: null,
  assignmentTemporaryUntilDate: null,
  bookingActiveUntilDate: null,
  bookingStartDate: null,
  slotState: '',
  virtualIntakeEnabled: false,
  inPersonIntakeEnabled: false
});

const isHourlyWorker = computed(() => {
  const raw = authStore.user?.isHourlyWorker ?? authStore.user?.is_hourly_worker;
  return raw === true || raw === 1 || raw === '1';
});

const isScheduleEventRequestType = computed(() => SCHEDULE_EVENT_ACTIONS.has(String(requestType.value || '')));
const quarterMinuteOptions = [0, 15, 30, 45];
const isQuarterHourRequestType = computed(() => {
  const t = String(requestType.value || '');
  return ['supervision', 'agency_meeting', 'huddle', 'personal_event', 'schedule_hold', 'indirect_services'].includes(t);
});
const canUseQuarterHourInput = computed(
  () => isQuarterHourRequestType.value && !(isScheduleEventRequestType.value && scheduleEventAllDay.value)
);
const endMinuteOptions = computed(
  () => (Number(modalEndHour.value || 0) >= modalGridMaxEnd.value - 1 ? [0] : quarterMinuteOptions)
);
const modalTimeRangeLabel = computed(() => {
  if (canUseQuarterHourInput.value) {
    return `${hourMinuteLabel(effectiveModalStartHour.value, modalStartMinute.value)}-${hourMinuteLabel(modalEndHour.value, modalEndMinute.value)}`;
  }
  return `${hourLabel(modalHour.value)}-${hourLabel(modalEndHour.value)}`;
});
const scheduleHoldReasonOptions = computed(() => SCHEDULE_HOLD_REASON_OPTIONS);
const scheduleEventTitlePlaceholder = computed(() => {
  const kind = String(requestType.value || '');
  if (kind === 'agency_meeting') return props.hideOfficeAndCalendarIntegration ? 'Team meeting' : 'Agency meeting';
  if (kind === 'huddle') return 'Huddle';
  if (kind === 'schedule_hold' || kind === 'schedule_hold_all_day') return 'Schedule hold';
  if (kind === 'indirect_services') return 'Indirect services';
  return 'Personal event';
});
const scheduleEventCanSubmit = computed(() => String(scheduleEventTitle.value || '').trim().length > 0);
const isScheduleEventTitleMissing = computed(() => (
  isScheduleEventRequestType.value
  && !!String(requestType.value || '').trim()
  && !scheduleEventCanSubmit.value
));
const disableEndTimeInput = computed(() => {
  if (requestType.value === 'intake_virtual_on' || requestType.value === 'intake_virtual_off' || requestType.value === 'intake_inperson_on' || requestType.value === 'intake_inperson_off') return true;
  if (isScheduleEventRequestType.value && scheduleEventAllDay.value) return true;
  return false;
});
const requestNotesPlaceholder = computed(() => {
  if (isScheduleEventRequestType.value) return 'Optional event details/description...';
  return 'Any context for staff reviewing this request...';
});

const hasRecurringOfficeSlot = computed(() => {
  const rows = requestType.value === 'forfeit_slot' ? selectedActionContexts() : [modalContext.value];
  return rows.some((x) => Number(x?.standingAssignmentId || 0) > 0);
});
const hasFutureForfeitSupport = computed(() => {
  const rows = requestType.value === 'forfeit_slot' ? selectedActionContexts() : [modalContext.value];
  return rows.some((x) => Number(x?.officeEventId || 0) > 0 || Number(x?.standingAssignmentId || 0) > 0);
});

const availableQuickActions = computed(() => {
  const ctx = modalContext.value || {};
  const hasOffice = Number(selectedOfficeLocationId.value || 0) > 0;
  const state = String(ctx.slotState || '').toUpperCase();
  const hasAssignedOffice = ['ASSIGNED_AVAILABLE', 'ASSIGNED_TEMPORARY', 'ASSIGNED_BOOKED'].includes(state);
  const hasEvent = Number(ctx.officeEventId || 0) > 0;
  const booked = state === 'ASSIGNED_BOOKED';
  const schoolWindowOk = canUseSchool(modalDay.value, modalHour.value, modalEndHour.value);
  const supervisionOptionVisible = canScheduleSupervisionFromGrid.value;
  // Admins with office-management rights can still see all office actions when viewing another user's schedule.
  // Privileged book-on-behalf + supervisors (supervisees enforced by API) keep full actions.
  const supervisionOnlyMode = isViewingOtherUserSchedule.value && !canSelectBookingProvider.value;
  const hasClinicalOrLearningOrg = effectiveAgencyFeatureFlags.value.hasClinicalOrg || effectiveAgencyFeatureFlags.value.hasLearningOrg;
  const actorId = Number(authStore.user?.id || 0);
  const assignedId = Number(ctx.assignedProviderId || 0);
  const isOwnAssignedSlot = actorId > 0 && assignedId > 0 && actorId === assignedId;
  return [
    {
      id: 'slot_details',
      label: 'Slot details',
      description: 'Provider, room, and session info for the hour(s) you selected',
      disabledReason: '',
      visible: !supervisionOnlyMode && (hasAssignedOffice || state === 'COMPANY_HOLD'),
      tone: 'slate'
    },
    {
      id: 'individual_session',
      label: 'Book Individual Session',
      description: hasOffice
        ? 'Schedule a session for a client — Virtual or In-person'
        : 'Schedule a virtual session now (office optional)',
      disabledReason: '',
      visible: !supervisionOnlyMode,
      tone: 'violet',
      chooserPriority: 10
    },
    {
      id: 'group_session',
      label: 'Group session',
      description: hasOffice ? 'Book group session and office together' : 'Select office first',
      disabledReason: hasOffice ? '' : 'Select office',
      visible: !supervisionOnlyMode && hasClinicalOrLearningOrg,
      tone: 'violet',
      chooserPriority: 40
    },
    {
      id: 'portal_intake',
      label: 'Open Slot for Booking',
      description: 'Publish open hours so new clients can book this time',
      disabledReason: '',
      visible: !supervisionOnlyMode && (
        !isAdminMode.value
        || String(modalContext.value?.slotState || '').toUpperCase() === 'ASSIGNED_AVAILABLE'
      ),
      tone: 'teal',
      chooserPriority: 20
    },
    {
      id: 'office',
      label: hasAssignedOffice ? 'Book this slot' : 'Office booking',
      description: hasAssignedOffice
        ? 'Mark your assigned office as booked — once or recurring'
        : 'Mark assigned office slot as booked/busy',
      disabledReason: hasEvent && ['ASSIGNED_AVAILABLE', 'ASSIGNED_TEMPORARY'].includes(state) && isOwnAssignedSlot
        ? ''
        : (!isOwnAssignedSlot ? 'Only the assigned provider can book this slot' : 'Select an assigned office slot'),
      visible: !supervisionOnlyMode && hasEvent && ['ASSIGNED_AVAILABLE', 'ASSIGNED_TEMPORARY'].includes(state) && isOwnAssignedSlot,
      tone: 'blue'
    },
    {
      id: 'office_request_only',
      label: 'Request office',
      description: 'Request permission to use office space (assigned-available slots only)',
      disabledReason: hasOffice ? '' : 'Select office',
      visible: !supervisionOnlyMode && state !== 'ASSIGNED_BOOKED',
      tone: 'teal'
    },
    {
      id: 'admin_assign',
      // Occupied slots: edit date/time/provider in the top bar. Keep this for open assign / holds.
      label: (booked || hasAssignedOffice) ? 'Advanced assign / hold' : 'Assign slot (admin)',
      description: (booked || hasAssignedOffice)
        ? 'Company hold, recurrence, or advanced reassignment options'
        : 'Directly assign this slot to a person or hold it — no request needed',
      disabledReason: '',
      visible: !supervisionOnlyMode && canManageOffices.value,
      tone: 'amber',
      // Push occupied-slot advanced assign into More; keep open-slot assign primary.
      chooserPriority: (booked || hasAssignedOffice) ? 90 : 15
    },
    {
      id: 'intake_virtual_on',
      label: 'Enable Virtual Intake',
      description: 'Auto-add virtual work hours if missing',
      disabledReason: hasEvent && !ctx.virtualIntakeEnabled ? '' : 'Needs assigned office slot',
      visible: hasEvent && !ctx.virtualIntakeEnabled,
      tone: 'cyan',
      chooserPriority: 25
    },
    {
      id: 'intake_inperson_on',
      label: 'Enable In-Person Intake',
      description: 'Only available on assigned office slots',
      disabledReason: hasEvent && hasAssignedOffice && !ctx.inPersonIntakeEnabled ? '' : 'Needs assigned office slot',
      visible: hasEvent && hasAssignedOffice && !ctx.inPersonIntakeEnabled,
      tone: 'green',
      chooserPriority: 26
    },
    {
      id: 'intake_virtual_off',
      label: 'Disable virtual intake',
      description: 'Keep regular virtual availability',
      disabledReason: hasEvent && !!ctx.virtualIntakeEnabled ? '' : 'Virtual intake not enabled',
      visible: hasEvent && !!ctx.virtualIntakeEnabled,
      tone: 'slate'
    },
    {
      id: 'intake_inperson_off',
      label: 'Disable in-person intake',
      description: 'Remove in-person intake availability',
      disabledReason: hasEvent && !!ctx.inPersonIntakeEnabled ? '' : 'In-person intake not enabled',
      visible: hasEvent && !!ctx.inPersonIntakeEnabled,
      tone: 'slate'
    },
    {
      id: 'school',
      label: 'School daytime availability',
      description: 'Weekday school assignment block (not a virtual session)',
      disabledReason: !isAdminMode.value && schoolWindowOk ? '' : 'Weekday 6AM-6PM only',
      visible: !supervisionOnlyMode && !isAdminMode.value,
      tone: 'indigo'
    },
    {
      id: 'supervision',
      label: 'Schedule Supervision',
      description: supervisionOptionVisible
        ? (supervisionProvidersLoading.value ? 'Loading participants...' : 'Book supervision with your supervisees')
        : 'Supervisors schedule sessions; supervisees join from My Supervision',
      disabledReason: !supervisionOptionVisible
        ? 'Available when you have supervisor privileges'
        : (supervisionProvidersLoading.value ? 'Loading providers' : ''),
      // Always list the action so non-supervisors see why it is unavailable (not a missing feature).
      visible: !supervisionOnlyMode || supervisionOptionVisible,
      tone: 'indigo',
      chooserPriority: 35
    },
    {
      id: 'agency_meeting',
      label: 'Schedule Meeting',
      description: 'Book a meeting with one or more participants',
      disabledReason: '',
      visible: !supervisionOnlyMode,
      tone: 'blue',
      chooserPriority: 18
    },
    {
      id: 'huddle',
      label: 'Huddle',
      description: 'Provider Plus: schedule a huddle with one or more participants (99415 for host, MEETING for participants)',
      disabledReason: isProviderPlus.value ? '' : 'Provider Plus only',
      visible: !supervisionOnlyMode && isProviderPlus.value,
      tone: 'cyan'
    },
    {
      id: 'personal_event',
      label: 'Personal event',
      description: 'Create a personal calendar event',
      disabledReason: '',
      visible: !supervisionOnlyMode,
      tone: 'emerald'
    },
    {
      id: 'schedule_hold',
      label: 'Schedule hold',
      description: 'Block this time with a hold reason',
      disabledReason: '',
      visible: !supervisionOnlyMode,
      tone: 'orange'
    },
    {
      id: 'schedule_hold_all_day',
      label: 'All-day schedule block',
      description: 'Create an all-day hold on this date',
      disabledReason: '',
      visible: !supervisionOnlyMode,
      tone: 'slate'
    },
    {
      id: 'indirect_services',
      label: 'Log Time',
      description: isHourlyWorker.value
        ? 'Open the hourly indirect time log for payroll'
        : 'Hourly workers log indirect time for payroll here',
      disabledReason: (isAdminMode.value || isHourlyWorker.value) ? '' : 'Hourly worker only',
      visible: !supervisionOnlyMode,
      tone: 'amber'
    },
    {
      id: 'start_video',
      label: 'Start Video Session',
      description: 'Open in-app telehealth video (client optional — share invite link later)',
      disabledReason: booked && Number(ctx.officeEventId || 0) > 0 ? '' : 'Needs booked office slot',
      visible: !supervisionOnlyMode && booked,
      tone: 'emerald',
      chooserPriority: 12
    },
    // Notes are session-affiliated: open the booked session (start_video / session edit) — not from empty office.
    {
      id: 'unbook_slot',
      label: 'Unbook (keep assigned)',
      description: 'Mark this slot as available again — keeps your recurring assignment intact',
      disabledReason: hasEvent && booked ? '' : 'Needs booked office slot',
      visible: hasEvent && booked,
      tone: 'slate'
    },
    {
      id: 'forfeit_slot',
      label: 'Forfeit this slot',
      description: 'Give up your assignment so someone else can use this office time',
      disabledReason: hasEvent ? '' : 'Needs assigned/booked slot',
      visible: !supervisionOnlyMode && (hasAssignedOffice || booked),
      tone: 'red',
      chooserPriority: 70
    },
    {
      id: 'cancel_booking',
      label: 'Cancel booking',
      description: 'Admin: delete this booking from the calendar (does not forfeit a standing assignment)',
      disabledReason: '',
      visible: !supervisionOnlyMode && canManageOffices.value && booked,
      tone: 'red',
      chooserPriority: 72
    },
    {
      id: 'extend_assignment',
      label: 'Extend assignment',
      description: (() => {
        const extCount = Number(ctx?.assignmentTemporaryExtensionCount ?? 0);
        const mode = String(ctx?.assignmentAvailabilityMode || '').toUpperCase();
        if (mode === 'TEMPORARY' && extCount >= 2) return 'Extension limit reached. Submit a new office request.';
        if (mode === 'TEMPORARY') return 'Extend by 6 weeks (max 2 extensions)';
        return 'Confirm assigned slot (keep available)';
      })(),
      disabledReason: (() => {
        const extCount = Number(ctx?.assignmentTemporaryExtensionCount ?? 0);
        const mode = String(ctx?.assignmentAvailabilityMode || '').toUpperCase();
        if (mode === 'TEMPORARY' && extCount >= 2) return 'Extension limit reached. Submit a new office request.';
        if (hasEvent && hasAssignedOffice && Number(ctx.standingAssignmentId || 0) > 0) return '';
        return 'Needs assigned office slot with standing assignment';
      })(),
      visible: !supervisionOnlyMode && hasEvent && hasAssignedOffice && Number(ctx.standingAssignmentId || 0) > 0,
      tone: 'emerald'
    }
  ];
});

const OFFICE_LAYOUT_ONLY_ACTIONS = new Set([
  'slot_details',
  'supervision',
  'forfeit_slot',
  'extend_assignment',
  'intake_virtual_on',
  'intake_inperson_on',
  'intake_virtual_off',
  'intake_inperson_off',
  'office',
  'office_request_only',
  'admin_assign',
  'unbook_slot',
  'start_video',
  'cancel_booking',
  'individual_session',
  'agency_meeting',
  'portal_intake',
  'group_session'
]);

/** Clicking an office block on the week grid — curated, no note writing. */
const OFFICE_BLOCK_ONLY_ACTIONS = new Set([
  'supervision',
  'forfeit_slot',
  'extend_assignment',
  'intake_virtual_on',
  'intake_inperson_on',
  'intake_virtual_off',
  'intake_inperson_off',
  'office',
  'individual_session',
  'group_session',
  'agency_meeting',
  'portal_intake',
  'admin_assign',
  'unbook_slot',
  'start_video',
  'cancel_booking'
]);

/** Empty reserved office (ASSIGNED_AVAILABLE): session, meeting, open booking, virtual set. */
const EMPTY_OFFICE_ACTIONS = new Set([
  'individual_session',
  'group_session',
  'agency_meeting',
  'portal_intake',
  'office',
  'intake_virtual_on',
  'intake_virtual_off',
  'intake_inperson_on',
  'intake_inperson_off',
  'admin_assign',
  'supervision',
  'forfeit_slot',
  'extend_assignment'
]);

const EMPTY_OFFICE_PRIMARY_IDS = [
  'individual_session',
  'agency_meeting',
  'portal_intake',
  'office',
  'intake_virtual_on',
  'intake_inperson_on',
  'supervision'
];

const CLUB_SCHEDULING_ACTIONS = new Set(['agency_meeting', 'huddle']);

const SLOT_ACTION_PREFS_PREFIX = 'schedule.slotActionPrefs.v1:';
const slotActionPrefs = ref({ order: [], usage: {} });
const showMoreSlotActions = ref(false);
const slotActionReorderMode = ref(false);
const slotActionDragId = ref('');

const loadSlotActionPrefs = () => {
  const uid = Number(authStore.user?.id || 0);
  try {
    const raw = localStorage.getItem(`${SLOT_ACTION_PREFS_PREFIX}${uid || 'anon'}`);
    if (!raw) {
      slotActionPrefs.value = { order: [], usage: {} };
      return;
    }
    const parsed = JSON.parse(raw);
    slotActionPrefs.value = {
      order: Array.isArray(parsed?.order) ? parsed.order.map(String) : [],
      usage: parsed?.usage && typeof parsed.usage === 'object' ? parsed.usage : {}
    };
  } catch {
    slotActionPrefs.value = { order: [], usage: {} };
  }
};

const persistSlotActionPrefs = () => {
  const uid = Number(authStore.user?.id || 0);
  try {
    localStorage.setItem(
      `${SLOT_ACTION_PREFS_PREFIX}${uid || 'anon'}`,
      JSON.stringify(slotActionPrefs.value || { order: [], usage: {} })
    );
  } catch { /* ignore */ }
};

const recordSlotActionUsage = (actionId) => {
  const id = String(actionId || '').trim();
  if (!id) return;
  const usage = { ...(slotActionPrefs.value.usage || {}) };
  usage[id] = Number(usage[id] || 0) + 1;
  slotActionPrefs.value = { ...slotActionPrefs.value, usage };
  persistSlotActionPrefs();
};

const sortQuickActionsSmart = (rows) => {
  const order = Array.isArray(slotActionPrefs.value.order) ? slotActionPrefs.value.order : [];
  const usage = slotActionPrefs.value.usage || {};
  const orderIndex = new Map(order.map((id, i) => [String(id), i]));
  return [...rows].sort((a, b) => {
    const aid = String(a?.id || '');
    const bid = String(b?.id || '');
    const ao = orderIndex.has(aid) ? orderIndex.get(aid) : 1000;
    const bo = orderIndex.has(bid) ? orderIndex.get(bid) : 1000;
    if (ao !== bo) return ao - bo;
    const au = Number(usage[aid] || 0);
    const bu = Number(usage[bid] || 0);
    if (bu !== au) return bu - au;
    return Number(a?.chooserPriority || 50) - Number(b?.chooserPriority || 50);
  });
};

const visibleQuickActions = computed(() => {
  const rows = Array.isArray(availableQuickActions.value) ? availableQuickActions.value : [];
  let filtered = rows.filter((row) => row?.visible !== false && row?.id !== 'booked_note' && row?.id !== 'booked_record');
  if (props.hideOfficeAndCalendarIntegration) {
    filtered = filtered.filter((row) => row?.id && CLUB_SCHEDULING_ACTIONS.has(row.id));
  } else {
    const state = String(modalContext.value?.slotState || '').toUpperCase();
    const isEmptyOffice = modalActionSource.value === 'office_block' && state === 'ASSIGNED_AVAILABLE';
    if (isEmptyOffice) {
      filtered = filtered.filter((row) => row?.id && EMPTY_OFFICE_ACTIONS.has(row.id));
    } else if (modalActionSource.value === 'office_block') {
      filtered = filtered.filter((row) => row?.id && OFFICE_BLOCK_ONLY_ACTIONS.has(row.id));
    } else if (viewMode.value === 'office_layout') {
      filtered = filtered.filter((row) => row?.id && OFFICE_LAYOUT_ONLY_ACTIONS.has(row.id));
    }
  }
  return sortQuickActionsSmart(filtered);
});

const SLOT_ACTION_PRIMARY_COUNT = 7;
const primaryQuickActions = computed(() => {
  const state = String(modalContext.value?.slotState || '').toUpperCase();
  const occupiedOffice = ['ASSIGNED_BOOKED', 'ASSIGNED_AVAILABLE', 'ASSIGNED_TEMPORARY'].includes(state);
  // Date/time/provider edit lives in the top bar — keep Advanced assign in More for occupied slots.
  const rows = (visibleQuickActions.value || []).filter((r) => !(occupiedOffice && r.id === 'admin_assign'));
  const isEmptyOffice = modalActionSource.value === 'office_block' && state === 'ASSIGNED_AVAILABLE';
  if (isEmptyOffice) {
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    const preferred = EMPTY_OFFICE_PRIMARY_IDS.map((id) => byId.get(id)).filter(Boolean);
    const preferredIds = new Set(preferred.map((r) => r.id));
    const rest = rows.filter((r) => !preferredIds.has(r.id));
    return sortQuickActionsSmart([...preferred, ...rest]).slice(0, SLOT_ACTION_PRIMARY_COUNT);
  }
  return rows.slice(0, SLOT_ACTION_PRIMARY_COUNT);
});
const moreQuickActions = computed(() => {
  const primaryIds = new Set((primaryQuickActions.value || []).map((r) => r.id));
  return (visibleQuickActions.value || []).filter((r) => !primaryIds.has(r.id));
});
const displayedChooserActions = computed(() => {
  if (showMoreSlotActions.value) return visibleQuickActions.value || [];
  return primaryQuickActions.value || [];
});

const APPOINTMENT_EDIT_REQUEST_TYPES = new Set([
  'edit_schedule_event',
  'edit_supervision',
  'pick_schedule_event'
]);
const isAppointmentEditMode = computed(() =>
  APPOINTMENT_EDIT_REQUEST_TYPES.has(String(requestType.value || '').trim())
);
const isScheduleEventEditMode = computed(() => String(requestType.value || '') === 'edit_schedule_event');
const isSupervisionEditMode = computed(() => String(requestType.value || '') === 'edit_supervision');
const isPickScheduleEventMode = computed(() => String(requestType.value || '') === 'pick_schedule_event');

/** True when no action is selected yet — card grid, not the form+sidebar. */
const showActionChooser = computed(() => {
  if (!showRequestModal.value) return false;
  if (isAppointmentEditMode.value) return false;
  return !String(requestType.value || '').trim();
});

const editingScheduleStackItem = computed(() => {
  const eid = Number(scheduleEventEditId.value || 0);
  if (!eid) return null;
  return (stackDetailsItems.value || []).find((it) => Number(it?.eventId || 0) === eid) || null;
});

const appointmentEditKindLabel = computed(() => {
  if (isSupervisionEditMode.value) return 'Supervision';
  const item = editingScheduleStackItem.value;
  if (item) return String(item.kindLabel || 'Schedule event');
  if (isPickScheduleEventMode.value) return 'Schedule';
  return 'Schedule';
});

const modalDurationLabel = computed(() => {
  const startH = Number(effectiveModalStartHour.value ?? modalHour.value ?? 0);
  const endH = Number(modalEndHour.value || 0);
  const startM = Number(modalStartMinute.value || 0);
  const endM = Number(modalEndMinute.value || 0);
  const mins = Math.max(0, (endH * 60 + endM) - (startH * 60 + startM));
  if (!mins) return '—';
  if (mins % 60 === 0) {
    const h = mins / 60;
    return `${h} hour${h === 1 ? '' : 's'}`;
  }
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m} min`;
  return `${h}h ${m}m`;
});

const modalWhenLabel = computed(() => {
  const day = String(modalDay.value || '');
  const range = String(modalTimeRangeLabel.value || '');
  const tz = bookingTimezoneLabel.value ? ` (${bookingTimezoneLabel.value})` : '';
  return [day, range].filter(Boolean).join(', ') + tz;
});

const modalTenantLabel = computed(() => {
  const id = Number(selectedActionAgencyId.value || effectiveAgencyId.value || 0);
  if (!id) return '—';
  return agencyLabel(id) || `Agency ${id}`;
});

const providerInitials = (personOrName) => {
  if (personOrName && typeof personOrName === 'object') {
    const f = String(personOrName.first_name || personOrName.firstName || '').trim();
    const l = String(personOrName.last_name || personOrName.lastName || '').trim();
    const a = (f[0] || '').toUpperCase();
    const b = (l[0] || '').toUpperCase();
    if (a || b) return `${a}${b}`;
    const label = String(personOrName.displayName || personOrName.fullName || personOrName.label || '').trim();
    if (label) {
      const parts = label.split(/[\s,]+/).filter(Boolean);
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      if (parts.length > 1) return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
    }
  }
  const parts = String(personOrName || '').split(/[\s,]+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
};

const participantPhotoUrl = (row) => String(
  row?.profilePhotoUrl
  || row?.profile_photo_url
  || row?.photoUrl
  || row?.photo_url
  || ''
).trim() || '';

const onChooserWhenChanged = () => {
  const start = Number(modalHour.value || 0);
  let end = Number(modalEndHour.value || 0);
  modalStartHour.value = start;
  if (!Number.isFinite(end) || end <= start) {
    end = Math.min(start + 1, Number(gridMaxHour.value || 22));
    modalEndHour.value = end;
  }
  officeAssignStartHour.value = start;
  officeAssignEndHour.value = end;
  officeAssignDay.value = String(modalDay.value || officeAssignDay.value || 'Monday');
};

const moveChooserAction = (actionId, direction) => {
  const id = String(actionId || '');
  const ids = (visibleQuickActions.value || []).map((r) => String(r.id));
  if (!ids.includes(id)) return;
  let order = Array.isArray(slotActionPrefs.value.order) && slotActionPrefs.value.order.length
    ? slotActionPrefs.value.order.map(String).filter((x) => ids.includes(x))
    : [...ids];
  for (const x of ids) {
    if (!order.includes(x)) order.push(x);
  }
  const idx = order.indexOf(id);
  const next = idx + direction;
  if (idx < 0 || next < 0 || next >= order.length) return;
  const copy = [...order];
  const [item] = copy.splice(idx, 1);
  copy.splice(next, 0, item);
  slotActionPrefs.value = { ...slotActionPrefs.value, order: copy };
  persistSlotActionPrefs();
};

const onChooserDragStart = (actionId, evt) => {
  slotActionDragId.value = String(actionId || '');
  try { evt?.dataTransfer?.setData('text/plain', slotActionDragId.value); } catch { /* ignore */ }
};
const onChooserDrop = (targetId) => {
  const from = String(slotActionDragId.value || '');
  const to = String(targetId || '');
  slotActionDragId.value = '';
  if (!from || !to || from === to) return;
  const ids = (visibleQuickActions.value || []).map((r) => String(r.id));
  let order = Array.isArray(slotActionPrefs.value.order) && slotActionPrefs.value.order.length
    ? slotActionPrefs.value.order.map(String).filter((x) => ids.includes(x))
    : [...ids];
  for (const x of ids) {
    if (!order.includes(x)) order.push(x);
  }
  const fromIdx = order.indexOf(from);
  const toIdx = order.indexOf(to);
  if (fromIdx < 0 || toIdx < 0) return;
  const copy = [...order];
  const [item] = copy.splice(fromIdx, 1);
  copy.splice(toIdx, 0, item);
  slotActionPrefs.value = { ...slotActionPrefs.value, order: copy };
  persistSlotActionPrefs();
};

const goBackToActionChooser = () => {
  requestType.value = '';
  requestTypeChosenByUser.value = false;
  modalError.value = '';
};

const actionRequiresAgency = computed(() => !AGENCY_OPTIONAL_ACTIONS.has(String(requestType.value || '')));
const scheduleEventRequiresAgency = computed(() => ['indirect_services', 'agency_meeting', 'huddle'].includes(String(requestType.value || '')));
const isAgencyOptionalScheduleEvent = computed(() => (
  ['personal_event', 'schedule_hold', 'schedule_hold_all_day'].includes(String(requestType.value || ''))
));
const showScheduleEventOrgPicker = computed(() => isAgencyOptionalScheduleEvent.value);
const scheduleEventOrgOptions = computed(() => {
  const byId = new Map();
  for (const row of scheduleOrgSelectOptions.value || []) {
    if (row?.id) byId.set(Number(row.id), row);
  }
  for (const row of actionAgencyOptions.value || []) {
    if (row?.id && !byId.has(Number(row.id))) byId.set(Number(row.id), row);
  }
  return Array.from(byId.values()).sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
});
const scheduleEventOrgNoneLabel = computed(() => (
  (scheduleEventOrgOptions.value || []).length > 1
    ? 'All / none (not tied to one organization)'
    : 'None (not tied to an organization)'
));
const scheduleEventOrgHelpText = computed(() => {
  if ((scheduleEventOrgOptions.value || []).length > 1) {
    return 'Pick a tenant to color-code this event, or All/none so it stays visible across every organization filter.';
  }
  return 'Optional — leave as None if this personal event is not tenant-specific.';
});
const scheduleEventAgencyScopeLabel = computed(() => {
  const id = Number(scheduleEventAgencyScope.value || 0);
  if (!id) return scheduleEventOrgNoneLabel.value;
  const opt = (scheduleEventOrgOptions.value || []).find((row) => Number(row?.id) === id);
  return String(opt?.label || opt?.name || '').trim() || agencyLabel(id) || `Agency ${id}`;
});

const intakeActionHelpText = computed(() => {
  const labels = {
    intake_virtual_on: 'Enable virtual intake for this office slot. If virtual working hours are missing, they will be auto-created.',
    intake_virtual_off: 'Disable virtual intake for this office slot (regular virtual availability stays active).',
    intake_inperson_on: 'Enable in-person intake for this assigned office slot.',
    intake_inperson_off: 'Disable in-person intake for this slot.'
  };
  return labels[String(requestType.value || '')] || '';
});

/** Primary CTA: "Schedule" by default; "Request…" only for pending-approval office flows. */
const submitActionLabel = computed(() => {
  const labels = {
    individual_session: 'Schedule session',
    group_session: 'Schedule session',
    office: 'Request office',
    office_request_only: 'Request office',
    portal_intake: 'Publish availability',
    school: 'Schedule school hours',
    supervision: isGroupSupervisionType.value ? 'Schedule group supervision' : 'Schedule supervision',
    agency_meeting: 'Schedule meeting',
    huddle: 'Schedule huddle',
    personal_event: 'Schedule event',
    schedule_hold: 'Schedule hold',
    schedule_hold_all_day: 'Schedule all-day hold',
    indirect_services: 'Schedule event',
    forfeit_slot: 'Forfeit selected slot(s)',
    extend_assignment: 'Extend assignment',
    intake_virtual_on: 'Enable virtual intake',
    intake_virtual_off: 'Disable virtual intake',
    intake_inperson_on: 'Enable in-person intake',
    intake_inperson_off: 'Disable in-person intake',
    booked_note: 'Open Note Aid',
    start_video: 'Start video session',
    booked_record: 'Open recorder',
    unbook_slot: 'Unbook selected slot(s)'
  };
  const t = String(requestType.value || '');
  if (virtualSessionShareUrl.value && isVirtualTelehealthSession.value) {
    return 'Open video room';
  }
  if (isVirtualTelehealthSession.value && linkPlatformVideoRoom.value) {
    return virtualSessionIsGroup.value ? 'Schedule group video session' : 'Schedule & link video room';
  }
  if ((t === 'agency_meeting' || t === 'huddle') && scheduleVideoConfigured.value && linkMeetingPlatformVideo.value) {
    return 'Schedule & link video room';
  }
  return labels[t] || 'Schedule';
});

const submitBusyLabel = computed(() => {
  const t = String(requestType.value || '');
  if (['office', 'office_request_only'].includes(t)) return 'Requesting…';
  if (t === 'portal_intake') return 'Publishing…';
  if (['forfeit_slot', 'unbook_slot', 'extend_assignment'].includes(t)) return 'Working…';
  if (String(t).startsWith('intake_')) return 'Updating…';
  if (['booked_note', 'start_video', 'booked_record'].includes(t)) return 'Opening…';
  return 'Scheduling…';
});

const REQUEST_NOTES_MAX = 500;
const selectedActionAgencyLabel = computed(() => {
  const id = Number(effectiveAgencyId.value || selectedActionAgencyId.value || 0);
  const opt = (actionAgencyOptions.value || []).find((row) => Number(row?.id) === id);
  return String(opt?.label || opt?.name || '').trim() || (id ? `Agency ${id}` : '—');
});
const requestSummaryOrganizationLabel = computed(() => {
  if (isAgencyOptionalScheduleEvent.value) return scheduleEventAgencyScopeLabel.value;
  return selectedActionAgencyLabel.value;
});
const selectedQuickActionLabel = computed(() => {
  const t = String(requestType.value || '');
  if (!t) return 'Not selected';
  const act = (visibleQuickActions.value || []).find((row) => String(row?.id) === t);
  if (act?.label) {
    return (props.hideOfficeAndCalendarIntegration && act.id === 'agency_meeting') ? 'Team meeting' : act.label;
  }
  return submitActionLabel.value || t;
});
const modalScheduleSubtitle = computed(() => {
  const t = String(requestType.value || '');
  if (t === 'edit_schedule_event') {
    const item = editingScheduleStackItem.value;
    const kind = appointmentEditKindLabel.value;
    const title = String(item?.label || '').trim();
    return title ? `Edit ${kind.toLowerCase()} — ${title}` : `Edit ${kind.toLowerCase()}`;
  }
  if (t === 'edit_supervision') {
    const who = String(selectedSupvSession.value?.counterpartyName || '').trim();
    return who ? `Edit supervision — ${who}` : 'Edit supervision session';
  }
  if (t === 'pick_schedule_event') return 'Choose which item to open and edit.';
  if (!t || showActionChooser.value) return 'Manage this office time slot';
  if (t === 'slot_details') return 'Selected office slot details.';
  if (['office', 'office_request_only'].includes(t)) return 'Send an office or room request for approval.';
  if (t === 'portal_intake') return 'Publish open hours for new clients on the portal.';
  if (t === 'school') return 'Mark school daytime availability (not virtual).';
  if (t === 'individual_session') return 'Schedule an individual session — virtual or in-person.';
  if (t === 'group_session') return 'Schedule a group session.';
  if (t === 'admin_assign') return 'Update this booking — change duration, provider, or frequency.';
  if (selectedQuickActionLabel.value && selectedQuickActionLabel.value !== 'Not selected') {
    return selectedQuickActionLabel.value;
  }
  return 'Confirm details, then schedule.';
});
const requestSummaryEndTimeLabel = computed(() => {
  if (isScheduleEventRequestType.value && scheduleEventAllDay.value) return 'All day';
  if (canUseQuarterHourInput.value) {
    return hourMinuteLabel(modalEndHour.value, modalEndMinute.value);
  }
  return hourLabel(modalEndHour.value);
});
const requestNotesCount = computed(() => String(requestNotes.value || '').length);
const requestSubmitBlockedReason = computed(() => {
  if (submitting.value) return submitBusyLabel.value;
  if (!String(requestType.value || '').trim()) return 'Select an action to continue.';
  if (actionRequiresAgency.value && !effectiveAgencyId.value) return 'Select an agency for this action.';
  const t = String(requestType.value || '');
  if (['office', 'group_session'].includes(t)) {
    if (bookingMetadataLoading.value) return 'Loading booking options…';
    if (!officeBookingValid.value) return 'Choose a valid office booking window.';
    if (bookingClassificationInvalidReason.value) return String(bookingClassificationInvalidReason.value);
  }
  if (t === 'individual_session') {
    const modality = String(bookingModality.value || '').toUpperCase();
    const hasOffice = Number(selectedOfficeLocationId.value || 0) > 0;
    if (!modality) return 'Choose Virtual or In-person.';
    if (!effectiveAgencyId.value) return 'Select an agency for this session.';
    if (!primarySessionClientId.value) return 'Select a client for this individual session.';
    if (modality === 'IN_PERSON' && !hasOffice) return 'In-person sessions need an office selected in the toolbar.';
    if (modality === 'TELEHEALTH') {
      if (bookingMetadataLoading.value) return 'Loading booking options…';
      if (bookingClassificationInvalidReason.value) return String(bookingClassificationInvalidReason.value);
      if (sessionAlsoRequestOffice.value && hasOffice && !officeBookingValid.value) {
        return 'Choose a valid office booking window.';
      }
      return '';
    }
    if (modality === 'IN_PERSON') {
      if (bookingMetadataLoading.value) return 'Loading booking options…';
      if (hasOffice && !officeBookingValid.value) return 'Choose a valid office booking window.';
      if (bookingClassificationInvalidReason.value) return String(bookingClassificationInvalidReason.value);
    }
  }
  if (t === 'portal_intake') {
    if (!effectiveAgencyId.value) return 'Select an agency for portal availability.';
    const endH = Number(modalEndHour.value);
    const startH = Number(modalHour.value);
    if (!(endH > startH)) return 'Choose an end time after the start.';
  }
  if (t === 'school' && !schoolWindowValid.value) {
    return 'School daytime availability must be on weekdays between 6 AM and 6 PM.';
  }
  if (t === 'supervision' && !supervisionCanSubmit.value) {
    return 'Add the required supervision participants before submitting.';
  }
  if ((t === 'agency_meeting' || t === 'huddle') && !meetingCanSubmit.value) {
    return 'Add at least one coworker before submitting.';
  }
  if (['intake_virtual_on', 'intake_virtual_off', 'intake_inperson_on', 'intake_inperson_off'].includes(t)
    && !Number(modalContext.value?.officeEventId || 0)) {
    return 'Select an assigned office slot for intake changes.';
  }
  if (t === 'extend_assignment' && !(Number(modalContext.value?.standingAssignmentId || 0) > 0)) {
    return 'Select an assigned office slot with a standing assignment.';
  }
  if (t === 'forfeit_slot') {
    if (!ackForfeit.value) return 'Acknowledge the forfeit before submitting.';
    const ok = selectedActionContexts().some(
      (x) => (Number(x?.officeEventId || 0) > 0 || Number(x?.standingAssignmentId || 0) > 0)
        && Number(x?.officeLocationId || 0) > 0
    );
    if (!ok) return 'Select an assigned/booked office slot to forfeit.';
  }
  if (isScheduleEventRequestType.value && !scheduleEventCanSubmit.value) {
    return 'Enter an event title before submitting.';
  }
  return '';
});
const requestSubmitDisabled = computed(() => !!requestSubmitBlockedReason.value);

const isVirtualGroupFromClients = computed(() => (
  isVirtualTelehealthSession.value
  && linkPlatformVideoRoom.value
  && virtualSessionSelectedClientIdSet.value.size > 1
));

const quickActionDisplayLabel = (act) => {
  if (props.hideOfficeAndCalendarIntegration && act.id === 'agency_meeting') return 'Team meeting';
  if (act.id === 'individual_session' && isVirtualGroupFromClients.value) return 'Group session';
  return act.label;
};

const quickActionDisplayDescription = (act) => {
  if (act.id === 'individual_session' && isVirtualGroupFromClients.value) {
    return `Group virtual session — ${virtualSessionSelectedClientIdSet.value.size} clients selected`;
  }
  return act.description;
};

const quickActionIconKey = (actionId) => {
  const map = {
    office_request_only: 'office',
    office: 'office',
    school: 'school',
    portal_intake: 'portal',
    agency_meeting: 'meeting',
    huddle: 'meeting',
    personal_event: 'person',
    schedule_hold: 'hold',
    schedule_hold_all_day: 'sun',
    indirect_services: 'hourglass',
    supervision: 'meeting',
    individual_session: 'session',
    group_session: 'meeting',
    forfeit_slot: 'hold',
    unbook_slot: 'unrequest',
    start_video: 'school',
    booked_note: 'notes',
    booked_record: 'notes',
    admin_assign: 'office',
    cancel_booking: 'close',
    extend_assignment: 'check',
    slot_details: 'person',
    intake_virtual_on: 'school',
    intake_virtual_off: 'school',
    intake_inperson_on: 'office',
    intake_inperson_off: 'office'
  };
  return map[String(actionId || '')] || 'school';
};

const bookingTypeOptions = computed(() => {
  const rows = Array.isArray(bookingMetadata.value?.appointmentTypes) ? bookingMetadata.value.appointmentTypes : [];
  const out = rows.map((row) => ({
    code: normalizeCodeValue(row?.code),
    label: String(row?.label || row?.code || '').trim()
  })).filter((row) => row.code);
  const selected = normalizeCodeValue(bookingAppointmentType.value);
  if (selected && !out.some((row) => row.code === selected)) {
    out.push({ code: selected, label: `Legacy (${selected})` });
  }
  return out;
});

const bookingSubtypeOptions = computed(() => {
  const typeCode = normalizeCodeValue(bookingAppointmentType.value);
  const rows = Array.isArray(bookingMetadata.value?.appointmentSubtypes) ? bookingMetadata.value.appointmentSubtypes : [];
  const out = rows
    .map((row) => ({
      code: normalizeCodeValue(row?.code),
      appointmentTypeCode: normalizeCodeValue(row?.appointmentTypeCode),
      label: String(row?.label || row?.code || '').trim()
    }))
    .filter((row) => row.code && (!typeCode || row.appointmentTypeCode === typeCode));
  const selected = normalizeCodeValue(bookingAppointmentSubtype.value);
  if (selected && !out.some((row) => row.code === selected)) {
    out.push({ code: selected, appointmentTypeCode: typeCode, label: `Legacy (${selected})` });
  }
  return out;
});

const bookingServiceCodeOptions = computed(() => {
  const rows = Array.isArray(bookingMetadata.value?.serviceCodes) ? bookingMetadata.value.serviceCodes : [];
  const out = rows.map((row) => ({
    code: normalizeCodeValue(row?.code),
    label: String(row?.label || row?.code || '').trim(),
    minDurationMinutes: Number(row?.minDurationMinutes || 0) || null,
    unitMinutes: Number(row?.unitMinutes || 0) || null,
    maxUnitsPerDay: Number(row?.maxUnitsPerDay || 0) || null,
    maxUnitsPerSession: Number(row?.maxUnitsPerSession || 0) || null,
    overflowServiceCode: row?.overflowServiceCode || null,
    allowedCredentialTiers: Array.isArray(row?.allowedCredentialTiers) ? row.allowedCredentialTiers : null,
    medical: !!row?.medical
  })).filter((row) => row.code);
  const selected = normalizeCodeValue(bookingServiceCode.value);
  if (selected && !out.some((row) => row.code === selected)) {
    out.push({
      code: selected,
      label: `Legacy (${selected})`,
      minDurationMinutes: null,
      unitMinutes: null,
      maxUnitsPerDay: null,
      maxUnitsPerSession: null,
      overflowServiceCode: null,
      allowedCredentialTiers: null,
      medical: false
    });
  }
  return out;
});
const bookingServiceLocationOptions = computed(() => {
  const rows = Array.isArray(bookingMetadata.value?.serviceLocations) ? bookingMetadata.value.serviceLocations : [];
  return rows.map((row) => ({
    id: Number(row?.id || 0),
    name: String(row?.name || '').trim() || `Location #${row?.id}`,
    placeOfService: String(row?.place_of_service || row?.placeOfService || '').trim(),
    billingOfficeName: String(row?.billing_office_name || row?.billingOfficeName || '').trim()
  })).filter((row) => row.id > 0);
});
const providerTierLabel = (tiers) => {
  if (!Array.isArray(tiers) || !tiers.length) return '';
  const map = { qbha: 'QBHA', bachelors: 'Bachelor’s+', intern_plus: 'Licensed / pre-licensed' };
  return tiers.map((t) => map[String(t).toLowerCase()] || t).join(', ');
};
const serviceCodeOptionHints = (opt) => {
  const hints = [];
  if (Number(opt?.minDurationMinutes || 0) > 0) hints.push(`min ${Number(opt.minDurationMinutes)}m`);
  if (Number(opt?.unitMinutes || 0) > 0) hints.push(`${Number(opt.unitMinutes)}m units`);
  if (Number(opt?.maxUnitsPerSession || 0) > 0) hints.push(`max ${Number(opt.maxUnitsPerSession)} units`);
  if (opt?.overflowServiceCode) hints.push(`overflow → ${opt.overflowServiceCode}`);
  const tierHint = providerTierLabel(opt?.allowedCredentialTiers);
  if (tierHint) hints.push(tierHint);
  return hints.length ? ` (${hints.join(', ')})` : '';
};

const isSessionBookingRequestType = computed(() => ['individual_session', 'group_session'].includes(String(requestType.value || '')));
const inferredSessionIsGroup = computed(() => {
  if (String(requestType.value || '') === 'group_session') return true;
  return virtualSessionSelectedClientIdSet.value.size > 1;
});
const bookingSessionSummaryHint = computed(() => {
  const modality = String(bookingModality.value || '').toUpperCase() === 'IN_PERSON' ? 'In-person' : 'Telehealth';
  const kind = inferredSessionIsGroup.value ? 'group' : 'individual';
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)} ${modality.toLowerCase()} session — pick the service code and location.`;
});
const modalSessionDurationMinutes = computed(() => {
  const startH = Number(modalHour.value || 0);
  const endH = Number(modalEndHour.value || startH + 1);
  const startM = Number(modalStartMinute.value || 0);
  const endM = Number(modalEndMinute.value || 0);
  const mins = (endH * 60 + endM) - (startH * 60 + startM);
  return Number.isFinite(mins) && mins > 0 ? mins : 60;
});
const bookingClassificationInvalidReason = computed(() => {
  if (!showClinicalBookingFields.value) return '';
  if (!isSessionBookingRequestType.value) return '';
  if (!normalizeCodeValue(bookingServiceCode.value)) {
    return 'A service code is required for this session.';
  }
  if (!Number(bookingServiceLocationId.value || 0)) {
    return 'Select a service location for this session.';
  }
  return '';
});

const resetBookingSelectionDefaults = () => {
  bookingAppointmentType.value = DEFAULT_BOOKING_TYPE;
  bookingAppointmentSubtype.value = '';
  bookingServiceCode.value = '';
  bookingServiceLocationId.value = 0;
  bookingUnitPreview.value = '';
  bookingModality.value = '';
};

const resetBookingMetadataState = () => {
  bookingMetadataLoading.value = false;
  bookingMetadataError.value = '';
  bookingMetadata.value = { appointmentTypes: [], appointmentSubtypes: [], serviceCodes: [], serviceLocations: [] };
};

const normalizeBookingSelectionPayload = () => {
  const isSession = showClinicalBookingFields.value && isSessionBookingRequestType.value;
  // Individual/group session already chosen in the sidebar; modality + attendee count imply subtype.
  const appointmentTypeCode = isSession
    ? 'SESSION'
    : 'AVAILABLE_SLOT';
  const clientId = String(requestType.value || '') === 'individual_session'
    ? (Number(primarySessionClientId.value || 0) || null)
    : null;
  return {
    appointmentTypeCode,
    appointmentSubtypeCode: null,
    serviceCode: isSession ? (normalizeCodeValue(bookingServiceCode.value) || null) : null,
    modality: isSessionBookingRequestType.value
      ? (normalizeCodeValue(bookingModality.value) || null)
      : null,
    serviceLocationId: isSession ? (Number(bookingServiceLocationId.value || 0) || null) : null,
    agencyId: Number(effectiveAgencyId.value || 0) || null,
    ...(clientId ? { clientId } : {})
  };
};

const preferDefaultServiceLocation = () => {
  if (Number(bookingServiceLocationId.value || 0) > 0) return;
  const locs = bookingServiceLocationOptions.value || [];
  if (!locs.length) return;
  const modality = String(bookingModality.value || '').toUpperCase();
  const preferPos = modality === 'IN_PERSON' ? '11' : '02';
  const hit = locs.find((l) => l.placeOfService === preferPos)
    || locs.find((l) => modality !== 'IN_PERSON' && (l.placeOfService === '10' || l.placeOfService === '02'))
    || locs[0];
  if (hit?.id) bookingServiceLocationId.value = hit.id;
};

const refreshBookingUnitPreview = async () => {
  bookingUnitPreview.value = '';
  if (!showClinicalBookingFields.value || !effectiveAgencyFeatureFlags.value.medicalBillingEnabled) return;
  const agencyId = Number(effectiveAgencyId.value || 0);
  const code = normalizeCodeValue(bookingServiceCode.value);
  if (!agencyId || !code) return;
  try {
    const res = await api.post('/medical-billing/service-codes/preview-units', {
      agencyId,
      serviceCode: code,
      minutes: modalSessionDurationMinutes.value
    });
    const d = res?.data || {};
    if (d.claimable === false) {
      bookingUnitPreview.value = d.reason || `Not claimable at ${modalSessionDurationMinutes.value} min for ${code}.`;
      return;
    }
    const parts = [`~${modalSessionDurationMinutes.value} min → ${d.units || 0} unit(s)`];
    if (d.effectiveServiceCode && d.effectiveServiceCode !== code) parts.push(`bills as ${d.effectiveServiceCode}`);
    if (d.overflowApplied) parts.push('overflow code applied');
    bookingUnitPreview.value = parts.join(' · ');
  } catch {
    bookingUnitPreview.value = '';
  }
};

const loadBookingMetadataForProvider = async () => {
  if (!['office', 'individual_session', 'group_session'].includes(String(requestType.value || '')) || !showRequestModal.value) return;
  if (!showClinicalBookingFields.value) return;
  const providerId = Number(scheduleActorUserId.value || props.userId || authStore.user?.id || 0);
  if (!providerId) {
    resetBookingMetadataState();
    return;
  }
  try {
    bookingMetadataLoading.value = true;
    bookingMetadataError.value = '';
    const resp = await api.get('/office-schedule/booking-metadata', {
      params: {
        providerId,
        agencyId: Number(effectiveAgencyId.value || 0) || undefined
      }
    });
    bookingMetadata.value = {
      appointmentTypes: Array.isArray(resp?.data?.appointmentTypes) ? resp.data.appointmentTypes : [],
      appointmentSubtypes: Array.isArray(resp?.data?.appointmentSubtypes) ? resp.data.appointmentSubtypes : [],
      serviceCodes: Array.isArray(resp?.data?.serviceCodes) ? resp.data.serviceCodes : [],
      serviceLocations: Array.isArray(resp?.data?.serviceLocations) ? resp.data.serviceLocations : []
    };
    bookingAppointmentType.value = 'SESSION';
    bookingAppointmentSubtype.value = '';
    preferDefaultServiceLocation();
  } catch (e) {
    bookingMetadata.value = { appointmentTypes: [], appointmentSubtypes: [], serviceCodes: [], serviceLocations: [] };
    bookingMetadataError.value = e?.response?.data?.error?.message || 'Could not load booking metadata for this provider.';
  } finally {
    bookingMetadataLoading.value = false;
  }
};

const modalOfficeRoomOptions = computed(() => {
  const g = officeGrid.value;
  const officeId = Number(selectedOfficeLocationId.value || 0);
  if (!officeId || !g || !Array.isArray(g.rooms) || !Array.isArray(g.slots)) return [];

  if (ALL_DAYS.indexOf(String(modalDay.value)) < 0) return [];
  const date = addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(modalDay.value));
  const startH = Number(modalHour.value);
  const endH = Number(modalEndHour.value);
  if (!(endH > startH)) return [];

  const byKey = new Map();
  for (const s of g.slots || []) {
    byKey.set(`${s.roomId}|${s.date}|${s.hour}`, s);
  }

  const stateLabel = (state, slot) => {
    const st = String(state || '');
    if (st === 'open') return 'Open';
    if (st === 'assigned_available') {
      const who = slot?.assignedProviderName || slot?.providerInitials || '';
      return who ? `Assigned available • ${who}` : 'Assigned available';
    }
    if (st === 'assigned_temporary') {
      const who = slot?.assignedProviderName || slot?.providerInitials || '';
      return who ? `Temporary • ${who}` : 'Temporary';
    }
    if (st === 'assigned_booked') {
      const who = slot?.bookedProviderName || slot?.providerInitials || '';
      return who ? `Booked • ${who}` : 'Booked';
    }
    return st || '—';
  };

  const currentUserId = Number(authStore.user?.id || 0);
  const isRequestableState = (st, slot) => {
    // Soft hold: open cells with a pending request are not requestable.
    if (st === 'open' && Number(slot?.pendingRequestCount || 0) > 0) return false;
    if (st === 'open' || st === 'assigned_available') return true;
    // Assigned to me: allow booking my assigned_temporary slot (convert to booked)
    if (st === 'assigned_temporary' && currentUserId > 0) {
      const slotProviderId = Number(slot?.providerId || slot?.assignedProviderId || 0);
      return slotProviderId === currentUserId;
    }
    return false;
  };

  const out = (g.rooms || []).map((r) => {
    const roomId = Number(r.id);
    const label = `${r.roomNumber ? `#${r.roomNumber} ` : ''}${r.label || r.name || `Room ${roomId}`}`.trim();
    let firstState = null;
    let requestable = true;
    let representativeSlot = null;

    for (let h = startH; h < endH; h++) {
      const s = byKey.get(`${roomId}|${date}|${h}`) || null;
      const st = String(s?.state || '');
      if (!st) {
        requestable = false;
        firstState = firstState || 'unknown';
        continue;
      }
      if (!firstState) {
        firstState = st;
        representativeSlot = s;
      } else if (firstState !== st) {
        // Mixed states across the range – treat as not requestable to avoid partial bookings.
        requestable = false;
      }
      if (!isRequestableState(st, s)) requestable = false;
      if (!requestable) {
        // still finish loop to determine a meaningful representative slot
      }
    }

    const st = firstState || 'unknown';
    return {
      roomId,
      label,
      state: st,
      stateLabel: stateLabel(st, representativeSlot),
      requestable
    };
  });

  return out.sort((a, b) => String(a.label).localeCompare(String(b.label)));
});

const modalSlotStateUpper = computed(() => String(modalContext.value?.slotState || '').toUpperCase());
const modalIsAssignedSlot = computed(() => ['ASSIGNED_AVAILABLE', 'ASSIGNED_TEMPORARY', 'ASSIGNED_BOOKED'].includes(modalSlotStateUpper.value));
const modalIsOwnedAssignedSlot = computed(() => {
  if (!modalIsAssignedSlot.value) return false;
  const actorId = Number(authStore.user?.id || 0);
  const assignedId = Number(modalContext.value?.assignedProviderId || 0);
  return actorId > 0 && assignedId > 0 && actorId === assignedId;
});
const modalIsOneTimeAssignedSlot = computed(() => {
  if (!modalIsOwnedAssignedSlot.value) return false;
  const freqLabel = String(modalContext.value?.frequencyLabel || '').trim().toLowerCase();
  if (freqLabel === 'once') return true;
  const since = String(modalContext.value?.assignmentAvailableSinceDate || '').slice(0, 10);
  const until = String(modalContext.value?.assignmentTemporaryUntilDate || '').slice(0, 10);
  return !!since && !!until && since === until;
});
const modalLockRoomToAssigned = computed(
  () => String(requestType.value || '') === 'office' && modalIsOwnedAssignedSlot.value && Number(modalContext.value?.roomId || 0) > 0
);
const modalLockedRoomLabel = computed(() => {
  const rid = Number(modalContext.value?.roomId || 0);
  if (!rid) return 'Assigned room';
  const opt = (modalOfficeRoomOptions.value || []).find((x) => Number(x.roomId) === rid);
  return String(opt?.label || modalContext.value?.roomLabel || '').trim() || `Room ${rid}`;
});

const resolveOfficeContiguousBookingSpan = ({ dateYmd, roomId, hour, slot = null } = {}) => {
  const ymd = String(dateYmd || '').slice(0, 10);
  const rid = Number(roomId || 0);
  const focusHour = Number(hour);
  if (!ymd || !rid || !Number.isFinite(focusHour)) return null;
  const focusSlot = slot || lookupOfficeGridSlot(ymd, focusHour, rid);
  const focusKey = officeLogicalBookingKey({ dateYmd: ymd, hour: focusHour, roomId: rid, slot: focusSlot });
  if (!focusKey || String(focusKey).startsWith('unknown')) return null;

  const dayRoomSlots = (Array.isArray(officeGrid.value?.slots) ? officeGrid.value.slots : [])
    .filter((s) =>
      String(s?.date || s?.dateYmd || '').slice(0, 10) === ymd
      && Number(s?.roomId || s?.room_id || 0) === rid
    );
  const byHour = new Map();
  for (const s of dayRoomSlots) byHour.set(Number(s?.hour), s);

  const matchesHour = (h) => {
    const s = byHour.get(Number(h));
    if (!s) return false;
    return officeLogicalBookingKey({ dateYmd: ymd, hour: h, roomId: rid, slot: s }) === focusKey;
  };

  let startHour = focusHour;
  let endHourInclusive = focusHour;
  while (matchesHour(startHour - 1)) startHour -= 1;
  while (matchesHour(endHourInclusive + 1)) endHourInclusive += 1;
  return {
    startHour,
    endHourExclusive: endHourInclusive + 1,
    hourCount: endHourInclusive - startHour + 1,
    rangeLabel: `${hourLabel(startHour)}–${hourLabel(endHourInclusive + 1)}`
  };
};

const modalOccupiedSlotSummary = computed(() => {
  const ctx = modalContext.value || {};
  const st = String(ctx.slotState || '').toUpperCase();
  const occupied = ['ASSIGNED_AVAILABLE', 'ASSIGNED_TEMPORARY', 'ASSIGNED_BOOKED', 'COMPANY_HOLD'].includes(st);
  const providerLabel = String(ctx.bookedProviderName || ctx.assignedProviderName || '').trim()
    || (st === 'COMPANY_HOLD' ? 'Company hold' : '');
  const mode = String(ctx.assignmentAvailabilityMode || '').toUpperCase();

  const selectedStart = Number(modalHour.value ?? ctx.hour ?? 0);
  const selectedEndExclusive = Math.max(
    Number(modalEndHour.value || 0),
    selectedStart + 1
  );
  const selectedHourCount = Math.max(1, selectedEndExclusive - selectedStart);
  const selectedRangeLabel = `${hourLabel(selectedStart)}–${hourLabel(selectedEndExclusive)}`;

  const fullBlock = occupied
    ? resolveOfficeContiguousBookingSpan({
      dateYmd: ctx.dateYmd,
      roomId: ctx.roomId,
      hour: Number.isFinite(selectedStart) ? selectedStart : ctx.hour,
      slot: null
    })
    : null;

  let isPartialOfLongerBlock = false;
  let blockSpanNote = '';
  if (fullBlock && fullBlock.hourCount > 1) {
    isPartialOfLongerBlock =
      selectedStart > fullBlock.startHour
      || selectedEndExclusive < fullBlock.endHourExclusive
      || selectedHourCount < fullBlock.hourCount;
    if (isPartialOfLongerBlock) {
      blockSpanNote = `Part of a longer booking (${fullBlock.rangeLabel}). You selected ${selectedRangeLabel}.`;
    } else {
      blockSpanNote = `Multi-hour booking · ${fullBlock.rangeLabel}`;
    }
  }

  const rawFreq = String(ctx.frequencyLabel || '').trim()
    || ({
      ONCE: 'Once',
      WEEKLY: 'Weekly',
      BIWEEKLY: 'Biweekly',
      MONTHLY: 'Monthly'
    }[String(ctx.bookedFrequency || ctx.assignedFrequency || '').toUpperCase()] || '');
  const untilYmd = String(ctx.bookingActiveUntilDate || ctx.assignmentTemporaryUntilDate || '').slice(0, 10);
  let bookedUntilLabel = '';
  if (untilYmd) {
    try {
      const d = new Date(`${untilYmd}T12:00:00`);
      bookedUntilLabel = Number.isNaN(d.getTime())
        ? untilYmd
        : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      bookedUntilLabel = untilYmd;
    }
  } else if (occupied && String(rawFreq).toLowerCase() !== 'once') {
    bookedUntilLabel = 'Ongoing';
  } else if (occupied && String(rawFreq).toLowerCase() === 'once') {
    bookedUntilLabel = 'This occurrence';
  }

  const roomDisplay = String(ctx.roomLabel || '').trim()
    || (Number(ctx.roomId || 0) > 0 ? `Room ${ctx.roomId}` : '');

  return {
    visible: occupied && (!!providerLabel || st === 'COMPANY_HOLD'),
    providerLabel: providerLabel || '—',
    statusLabel: officeSlotStatusLabel(st),
    frequencyLabel: rawFreq,
    bookedUntilLabel,
    untilYmd,
    statusKey: st === 'ASSIGNED_BOOKED'
      ? 'BOOKED'
      : (st === 'ASSIGNED_TEMPORARY' || mode === 'TEMPORARY' ? 'TEMPORARY' : 'ASSIGNED'),
    frequencyKey: (() => {
      const fromLabel = String(rawFreq || '').trim().toLowerCase();
      if (fromLabel === 'once' || fromLabel === 'one time' || fromLabel === '1x') return 'ONCE';
      if (fromLabel === 'weekly') return 'WEEKLY';
      if (fromLabel === 'biweekly') return 'BIWEEKLY';
      if (fromLabel === 'monthly') return 'MONTHLY';
      const fromCode = String(ctx.bookedFrequency || ctx.assignedFrequency || 'WEEKLY').toUpperCase();
      return ['ONCE', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'].includes(fromCode) ? fromCode : 'WEEKLY';
    })(),
    assignmentModeLabel: mode === 'PERMANENT' ? 'Permanent' : (mode === 'TEMPORARY' ? 'Temporary' : ''),
    sessionTypeLabel: String(ctx.appointmentTypeLabel || '').trim() || '',
    roomLabel: String(ctx.roomLabel || '').trim() || '',
    roomDisplay,
    dateRangeLabel: `${String(ctx.dayName || modalDay.value || '')} • ${modalTimeRangeLabel.value || ''}`.trim(),
    createdByLabel: String(ctx.assignmentCreatedByName || ctx.bookingCreatedByName || '').trim() || '',
    isPartialOfLongerBlock,
    blockSpanNote,
    fullBlockRangeLabel: fullBlock?.rangeLabel || '',
    showBookingMeta: occupied && (!!rawFreq || !!bookedUntilLabel || !!officeSlotStatusLabel(st) || !!roomDisplay)
  };
});

const bookingStripFrequency = ref('WEEKLY');
const bookingStripStatus = ref('ASSIGNED');
const bookingStripUntil = ref('');
const bookingStripSaving = ref(false);
const bookingStripError = ref('');
const bookingStripBaseline = ref({ frequency: 'WEEKLY', status: 'ASSIGNED', until: '' });

const canEditBookingStrip = computed(() => {
  if (!canManageOffices.value) return false;
  if (!modalOccupiedSlotSummary.value?.showBookingMeta) return false;
  return Number(modalContext.value?.standingAssignmentId || 0) > 0
    || Number(modalContext.value?.officeEventId || 0) > 0;
});

const bookingStripDirty = computed(() => {
  const b = bookingStripBaseline.value || {};
  return String(bookingStripFrequency.value || '') !== String(b.frequency || '')
    || String(bookingStripStatus.value || '') !== String(b.status || '')
    || String(bookingStripUntil.value || '') !== String(b.until || '');
});

const syncBookingStripFromContext = () => {
  const sum = modalOccupiedSlotSummary.value || {};
  const freq = String(sum.frequencyKey || 'WEEKLY').toUpperCase();
  const status = String(sum.statusKey || 'ASSIGNED').toUpperCase();
  const until = String(sum.untilYmd || '').slice(0, 10);
  bookingStripFrequency.value = ['ONCE', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'].includes(freq) ? freq : 'WEEKLY';
  bookingStripStatus.value = ['BOOKED', 'ASSIGNED', 'TEMPORARY'].includes(status) ? status : 'ASSIGNED';
  bookingStripUntil.value = until;
  bookingStripError.value = '';
  bookingStripBaseline.value = {
    frequency: bookingStripFrequency.value,
    status: bookingStripStatus.value,
    until: bookingStripUntil.value
  };
};

watch(
  () => [
    showRequestModal.value,
    modalContext.value?.standingAssignmentId,
    modalContext.value?.officeEventId,
    modalContext.value?.slotState,
    modalContext.value?.frequencyLabel,
    modalContext.value?.bookingActiveUntilDate,
    modalContext.value?.assignmentTemporaryUntilDate
  ],
  () => {
    if (!showRequestModal.value) return;
    if (!modalOccupiedSlotSummary.value?.showBookingMeta) return;
    syncBookingStripFromContext();
  },
  { immediate: true }
);

const saveBookingStripEdits = async () => {
  bookingStripError.value = '';
  const ctx = modalContext.value || {};
  const officeLocationId = Number(ctx.officeLocationId || selectedOfficeLocationId.value || 0);
  const standingId = Number(ctx.standingAssignmentId || 0);
  const eventId = Number(ctx.officeEventId || 0);
  if (!officeLocationId || (!standingId && !eventId)) {
    bookingStripError.value = 'Missing office booking context.';
    return;
  }
  if (!canManageOffices.value) {
    bookingStripError.value = 'Only schedule managers can edit this booking.';
    return;
  }

  let freq = String(bookingStripFrequency.value || 'WEEKLY').toUpperCase();
  let status = String(bookingStripStatus.value || 'ASSIGNED').toUpperCase();
  const until = String(bookingStripUntil.value || '').slice(0, 10);
  const startYmd = String(ctx.bookingStartDate || ctx.dateYmd || '').slice(0, 10)
    || addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(modalDay.value));

  // Monthly only exists on booking plans.
  if (freq === 'MONTHLY' && status !== 'BOOKED') status = 'BOOKED';
  // One-time is occurrence-scoped.
  if (freq === 'ONCE') {
    bookingStripUntil.value = '';
  }

  bookingStripSaving.value = true;
  try {
    if (standingId > 0) {
      if (status === 'TEMPORARY') {
        await api.post(`/office-slots/${officeLocationId}/assignments/${standingId}/temporary`, {
          untilDate: until || undefined,
          weeks: until ? undefined : 4
        });
      } else if (status === 'ASSIGNED') {
        const current = String(ctx.slotState || '').toUpperCase();
        if (current === 'ASSIGNED_BOOKED' || Number(ctx.bookingPlanId || 0) > 0) {
          await api.post(`/office-slots/${officeLocationId}/assignments/${standingId}/downgrade`, { to: 'assigned' });
        }
        if (String(ctx.assignmentAvailabilityMode || '').toUpperCase() === 'TEMPORARY' || current === 'ASSIGNED_TEMPORARY') {
          await api.post(`/office-slots/${officeLocationId}/assignments/${standingId}/keep-available`, { acknowledged: true });
        }
        if (freq === 'WEEKLY' || freq === 'BIWEEKLY') {
          await api.post(`/office-slots/${officeLocationId}/assignments/${standingId}/recurrence`, {
            recurrenceFrequency: freq
          });
        } else if (freq === 'ONCE') {
          await api.post(`/office-slots/${officeLocationId}/assignments/${standingId}/temporary`, {
            untilDate: startYmd
          });
        }
      } else if (status === 'BOOKED') {
        const bookedFreq = freq === 'ONCE' ? 'WEEKLY' : freq;
        await api.post(`/office-slots/${officeLocationId}/assignments/${standingId}/booking-plan`, {
          bookedFrequency: ['WEEKLY', 'BIWEEKLY', 'MONTHLY'].includes(bookedFreq) ? bookedFreq : 'WEEKLY',
          bookingStartDate: startYmd,
          recurringUntilDate: until || undefined,
          bookedOccurrenceCount: freq === 'ONCE' ? 1 : undefined
        });
        if (freq === 'WEEKLY' || freq === 'BIWEEKLY') {
          await api.post(`/office-slots/${officeLocationId}/assignments/${standingId}/recurrence`, {
            recurrenceFrequency: freq
          });
        }
      }
    } else if (eventId > 0) {
      if (status === 'BOOKED' || freq !== 'ONCE') {
        await api.post(`/office-slots/${officeLocationId}/events/${eventId}/booking-plan`, {
          bookedFrequency: freq === 'ONCE' ? 'WEEKLY' : freq,
          bookingStartDate: startYmd,
          recurringUntilDate: until || undefined,
          bookedOccurrenceCount: freq === 'ONCE' ? 1 : undefined
        });
      }
      if (freq === 'WEEKLY' || freq === 'BIWEEKLY') {
        await api.post(`/office-slots/${officeLocationId}/events/${eventId}/recurrence`, {
          recurrenceFrequency: freq
        });
      }
    }

    bookingStripBaseline.value = {
      frequency: bookingStripFrequency.value,
      status: bookingStripStatus.value,
      until: bookingStripUntil.value
    };
    await loadSelectedOfficeGrid();
    await load({ forceRefresh: true });
    // Re-open context from refreshed grid if possible
    const ymd = String(ctx.dateYmd || startYmd).slice(0, 10);
    const hour = Number(ctx.hour ?? modalHour.value);
    const roomId = Number(ctx.roomId || 0);
    const slot = lookupOfficeGridSlot(ymd, hour, roomId);
    if (slot) {
      modalContext.value = buildModalContext({
        dayName: modalDay.value,
        dateYmd: ymd,
        hour,
        roomId,
        slot
      });
      syncBookingStripFromContext();
    }
  } catch (e) {
    bookingStripError.value = e?.response?.data?.error?.message || e?.message || 'Could not update booking.';
  } finally {
    bookingStripSaving.value = false;
  }
};

const isTelehealthModality = computed(
  () => String(bookingModality.value || '').toUpperCase() === 'TELEHEALTH'
);
const officeBookingValid = computed(() => {
  if (!['office', 'individual_session', 'group_session'].includes(String(requestType.value || ''))) return true;
  const endH = Number(modalEndHour.value);
  const startH = Number(modalHour.value);
  if (!(endH > startH)) return false;
  // Virtual individual sessions do not require an office.
  if (String(requestType.value) === 'individual_session' && isTelehealthModality.value) return true;
  const officeId = Number(selectedOfficeLocationId.value || 0);
  if (!officeId) return false;
  // In Open Finder, room picker is intentionally hidden and booking uses any open room.
  if (viewMode.value !== 'office_layout') return true;
  // If a specific room is picked, it must be requestable in the options list.
  const rid = Number(selectedOfficeRoomId.value || 0);
  if (!rid) return true; // any open room
  const opt = (modalOfficeRoomOptions.value || []).find((x) => Number(x.roomId) === rid);
  return !!opt?.requestable;
});

const officeBookingHint = computed(() => {
  if (!['office', 'individual_session', 'group_session'].includes(String(requestType.value || ''))) return '';
  const officeId = Number(selectedOfficeLocationId.value || 0);
  if (!officeId) return '';
  if (requestType.value === 'office') {
    if (officeBookingRecurrence.value === 'ONCE') {
      return 'Office booking marks the selected assigned slot as booked immediately.';
    }
    return 'Recurring office booking updates the assigned slot booking plan immediately.';
  }
  if (officeBookingRecurrence.value === 'ONCE') {
    return 'Same-day “Once” requests auto-book if an open room exists; otherwise they go to approvals.';
  }
  return 'Weekly/Biweekly/Monthly requests go to approvals and will create a booking plan on approval.';
});

const officeRequestSummary = computed(() => {
  const officeId = Number(selectedOfficeLocationId.value || 0);
  const office = (officeLocations.value || []).find((o) => Number(o?.id || 0) === officeId) || null;
  const building = String(office?.name || office?.label || '').trim() || (officeId ? `Office ${officeId}` : 'Not selected');
  const selectedRoomId = Number(selectedOfficeRoomId.value || modalContext.value?.roomId || 0) || 0;
  const roomOpt = (modalOfficeRoomOptions.value || []).find((r) => Number(r?.roomId || 0) === selectedRoomId) || null;
  const room = selectedRoomId > 0
    ? (String(roomOpt?.label || '').trim() || `Room ${selectedRoomId}`)
    : 'Any (per request policy)';
  const startH = Number(modalHour.value || 0);
  const endH = Number(modalEndHour.value || 0);
  const safeEnd = endH > startH ? endH : (startH + 1);
  const hours = Math.max(1, safeEnd - startH);
  return {
    building,
    room,
    timeRange: `${hourLabel(startH)} - ${hourLabel(safeEnd)}`,
    duration: `${hours} hour${hours === 1 ? '' : 's'}`
  };
});

const supervisionProvidersLoading = ref(false);
const supervisionProviders = ref([]);
const supervisionIncludeAllAgencies = ref(false);
const selectedSupervisionParticipantId = ref(0);
const selectedSupervisionAdditionalParticipantIds = ref([]);
const showAdditionalParticipantsPicker = ref(false);
const createSupervisionMeetLink = ref(true);
const supervisionParticipantSearch = ref('');

const availableSupervisionParticipants = computed(() => {
  const actorId = Number(authStore.user?.id || 0);
  const rows = Array.isArray(supervisionProviders.value) ? supervisionProviders.value : [];
  return rows.filter((row) => Number(row?.id || 0) !== actorId);
});

const filteredSupervisionParticipants = computed(() => {
  const q = String(supervisionParticipantSearch.value || '').trim().toLowerCase();
  const rows = availableSupervisionParticipants.value || [];
  if (!q) return rows;
  return rows.filter((row) => {
    const first = String(row?.firstName || '').trim().toLowerCase();
    const last = String(row?.lastName || '').trim().toLowerCase();
    const email = String(row?.email || '').trim().toLowerCase();
    const full = `${first} ${last}`.trim();
    return first.includes(q) || last.includes(q) || full.includes(q) || email.includes(q);
  });
});

const selectedSupervisionAdditionalParticipantIdSet = computed(
  () => new Set((selectedSupervisionAdditionalParticipantIds.value || []).map((n) => Number(n || 0)).filter((n) => n > 0))
);
const supervisionSelectedParticipantCount = computed(() => {
  const primary = Number(selectedSupervisionParticipantId.value || 0) > 0 ? 1 : 0;
  const extras = selectedSupervisionAdditionalParticipantIdSet.value.size;
  return primary + extras;
});
/** Derived from participant count: 0 additional = individual, 1 = triadic (billed as individual), 2+ = group (99416) */
const supervisionEffectiveSessionType = computed(() => {
  const extras = selectedSupervisionAdditionalParticipantIdSet.value.size;
  if (extras >= 2) return 'group';
  if (extras === 1) return 'triadic';
  return 'individual';
});
const supervisionEffectiveSessionTypeLabel = computed(() => {
  const t = supervisionEffectiveSessionType.value;
  if (t === 'group') return 'Group supervision (99416)';
  if (t === 'triadic') return 'Triadic supervision (counts as individual for everyone)';
  return 'Individual supervision';
});
const isGroupSupervisionType = computed(() => supervisionEffectiveSessionType.value === 'group');
const supervisionCanUseAllAgencies = computed(
  () => isGroupSupervisionType.value && (effectiveAgencyIds.value || []).length > 1
);
const supervisionUsingAllAgencies = computed(
  () => supervisionCanUseAllAgencies.value && !!supervisionIncludeAllAgencies.value
);
const supervisionCanSubmit = computed(() => {
  if (supervisionProvidersLoading.value) return false;
  if ((availableSupervisionParticipants.value || []).length === 0) return false;
  if (!Number(selectedSupervisionParticipantId.value || 0)) return false;
  if (isGroupSupervisionType.value && supervisionSelectedParticipantCount.value < 3) return false;
  return true;
});

const filteredSupervisionAdditionalParticipants = computed(() => {
  const primaryId = Number(selectedSupervisionParticipantId.value || 0);
  return (filteredSupervisionParticipants.value || []).filter((row) => Number(row?.id || 0) !== primaryId);
});

const supervisionParticipantById = computed(() => {
  const m = new Map();
  for (const row of (availableSupervisionParticipants.value || [])) {
    const id = Number(row?.id || 0);
    if (id > 0) m.set(id, row);
  }
  return m;
});

const selectedSupervisionParticipantChips = computed(() => {
  const chips = [];
  const primaryId = Number(selectedSupervisionParticipantId.value || 0);
  if (primaryId > 0) {
    chips.push({ id: primaryId, kind: 'primary', row: supervisionParticipantById.value.get(primaryId) || null });
  }
  for (const idRaw of (selectedSupervisionAdditionalParticipantIds.value || [])) {
    const id = Number(idRaw || 0);
    if (id > 0 && id !== primaryId) {
      chips.push({ id, kind: 'additional', row: supervisionParticipantById.value.get(id) || null });
    }
  }
  return chips;
});

const toggleSupervisionAdditionalParticipant = (userId) => {
  const id = Number(userId || 0);
  if (!id) return;
  const primaryId = Number(selectedSupervisionParticipantId.value || 0);
  if (id === primaryId) return;
  const next = new Set((selectedSupervisionAdditionalParticipantIds.value || []).map((n) => Number(n || 0)).filter((n) => n > 0 && n !== primaryId));
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedSupervisionAdditionalParticipantIds.value = Array.from(next.values());
};

const togglePrimarySupervisionParticipant = (userId) => {
  const id = Number(userId || 0);
  if (!id) return;
  const current = Number(selectedSupervisionParticipantId.value || 0);
  selectedSupervisionParticipantId.value = current === id ? 0 : id;
};

const selectAllFilteredSupervisionAdditionalParticipants = () => {
  const primaryId = Number(selectedSupervisionParticipantId.value || 0);
  const next = new Set((selectedSupervisionAdditionalParticipantIds.value || []).map((n) => Number(n || 0)).filter((n) => n > 0 && n !== primaryId));
  for (const row of (filteredSupervisionAdditionalParticipants.value || [])) {
    const id = Number(row?.id || 0);
    if (id > 0 && id !== primaryId) next.add(id);
  }
  selectedSupervisionAdditionalParticipantIds.value = Array.from(next.values());
};

const selectAllAvailableSupervisionAdditionalParticipants = () => {
  const primaryId = Number(selectedSupervisionParticipantId.value || 0);
  const next = (availableSupervisionParticipants.value || [])
    .map((row) => Number(row?.id || 0))
    .filter((id) => id > 0 && id !== primaryId);
  selectedSupervisionAdditionalParticipantIds.value = Array.from(new Set(next));
};

const clearSupervisionAdditionalParticipants = () => {
  selectedSupervisionAdditionalParticipantIds.value = [];
};

const removeSelectedSupervisionParticipant = (userId, kind = 'additional') => {
  const id = Number(userId || 0);
  if (!id) return;
  if (kind === 'primary') {
    selectedSupervisionParticipantId.value = 0;
    selectedSupervisionAdditionalParticipantIds.value = (selectedSupervisionAdditionalParticipantIds.value || [])
      .map((n) => Number(n || 0))
      .filter((n) => n > 0 && n !== id);
    return;
  }
  selectedSupervisionAdditionalParticipantIds.value = (selectedSupervisionAdditionalParticipantIds.value || [])
    .map((n) => Number(n || 0))
    .filter((n) => n > 0 && n !== id);
};

const supervisionParticipantLabel = (row) => {
  const first = String(row?.firstName || '').trim();
  const last = String(row?.lastName || '').trim();
  const name = [first, last].filter(Boolean).join(' ').trim();
  const email = String(row?.email || '').trim();
  if (name && email) return `${name} (${email})`;
  if (name) return name;
  if (email) return email;
  return `User ${Number(row?.id || 0) || ''}`.trim();
};

const meetingCandidatesLoading = ref(false);
const meetingCandidates = ref([]);
const meetingParticipantSearch = ref('');
const selectedMeetingParticipantIds = ref([]);
const createMeetingMeetLink = ref(true);
const linkMeetingPlatformVideo = ref(true);

const scheduleVideoConfigured = computed(() => !!summary.value?.videoConfigured);

function addCreateAgendaDraftItem() {
  const t = String(createAgendaDraftTitle.value || '').trim();
  if (!t) return;
  createAgendaDraftItems.value.push({ title: t });
  createAgendaDraftTitle.value = '';
}
function removeCreateAgendaDraftItem(idx) {
  createAgendaDraftItems.value.splice(idx, 1);
}
async function postAgendaItemsForNewMeeting(meetingType, meetingId, itemsToAdd) {
  const items = itemsToAdd ?? createAgendaDraftItems.value;
  if (!items.length) return;
  try {
    const agendaRes = await api.get('/meeting-agendas', { params: { meetingType, meetingId } });
    const agendaId = agendaRes.data?.agenda?.id;
    if (!agendaId) return;
    await api.post(`/meeting-agendas/${agendaId}/items/bulk`, { items });
  } catch {
    // best-effort
  } finally {
    if (!itemsToAdd) createAgendaDraftItems.value = [];
  }
}
const meetingIncludeAllAgencies = ref(false);
const meetingBusyByUserId = ref({});
const meetingBusyLoading = ref(false);

const meetingCanUseAllAgencies = computed(() => (effectiveAgencyIds.value || []).length > 1);
const meetingUsingAllAgencies = computed(() => meetingCanUseAllAgencies.value && !!meetingIncludeAllAgencies.value);
const availableMeetingCandidates = computed(() => {
  const actorId = Number(authStore.user?.id || 0);
  const viewedUserId = Number(props.userId || actorId || 0);
  const rows = Array.isArray(meetingCandidates.value) ? meetingCandidates.value : [];
  return rows.filter((row) => {
    const id = Number(row?.id || 0);
    return id > 0 && id !== actorId && id !== viewedUserId;
  });
});
const filteredMeetingCandidates = computed(() => {
  const q = String(meetingParticipantSearch.value || '').trim().toLowerCase();
  const rows = availableMeetingCandidates.value || [];
  if (!q) return rows;
  return rows.filter((row) => {
    const first = String(row?.firstName || '').trim().toLowerCase();
    const last = String(row?.lastName || '').trim().toLowerCase();
    const email = String(row?.email || '').trim().toLowerCase();
    const full = `${first} ${last}`.trim();
    return first.includes(q) || last.includes(q) || full.includes(q) || email.includes(q);
  });
});
const selectedMeetingParticipantIdSet = computed(
  () => new Set((selectedMeetingParticipantIds.value || []).map((n) => Number(n || 0)).filter((n) => n > 0))
);
const meetingCanSubmit = computed(
  () => !meetingCandidatesLoading.value && selectedMeetingParticipantIdSet.value.size > 0
);
const isMeetingParticipantsMissing = computed(() => (
  ['agency_meeting', 'huddle'].includes(String(requestType.value || ''))
  && !meetingCandidatesLoading.value
  && selectedMeetingParticipantIdSet.value.size === 0
));
const requestModalIsDirty = computed(() => {
  if (submitting.value) return true;
  if (String(requestType.value || '').trim()) return true;
  if (String(requestNotes.value || '').trim()) return true;
  if (String(scheduleEventTitle.value || '').trim()) return true;
  if ((selectedMeetingParticipantIds.value || []).length) return true;
  if ((virtualSessionSelectedClientIds.value || []).length) return true;
  return false;
});
const selectedMeetingParticipantChips = computed(() => {
  const byId = new Map();
  for (const row of (availableMeetingCandidates.value || [])) {
    const id = Number(row?.id || 0);
    if (id > 0) byId.set(id, row);
  }
  return Array.from(selectedMeetingParticipantIdSet.value.values()).map((id) => ({
    id,
    row: byId.get(id) || null
  }));
});
const meetingParticipantBusyText = (userId) => {
  const id = Number(userId || 0);
  if (!id) return '';
  if (meetingBusyLoading.value) return 'Checking...';
  return meetingBusyByUserId.value[id] ? 'Busy in this slot' : 'Available in this slot';
};
const isMeetingParticipantBusy = (userId) => {
  const id = Number(userId || 0);
  return !!(id && meetingBusyByUserId.value[id]);
};
const toggleMeetingParticipant = (userId) => {
  const id = Number(userId || 0);
  if (!id) return;
  const next = new Set((selectedMeetingParticipantIds.value || []).map((n) => Number(n || 0)).filter((n) => n > 0));
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedMeetingParticipantIds.value = Array.from(next.values());
};
const selectAllFilteredMeetingParticipants = () => {
  const next = new Set((selectedMeetingParticipantIds.value || []).map((n) => Number(n || 0)).filter((n) => n > 0));
  for (const row of (filteredMeetingCandidates.value || [])) {
    const id = Number(row?.id || 0);
    if (id > 0) next.add(id);
  }
  selectedMeetingParticipantIds.value = Array.from(next.values());
};
const selectAllAvailableMeetingParticipants = () => {
  selectedMeetingParticipantIds.value = Array.from(new Set(
    (availableMeetingCandidates.value || []).map((row) => Number(row?.id || 0)).filter((n) => n > 0)
  ));
};
const clearMeetingParticipants = () => {
  selectedMeetingParticipantIds.value = [];
};
const removeSelectedMeetingParticipant = (userId) => {
  const id = Number(userId || 0);
  if (!id) return;
  selectedMeetingParticipantIds.value = (selectedMeetingParticipantIds.value || [])
    .map((n) => Number(n || 0))
    .filter((n) => n > 0 && n !== id);
};

const isVirtualTelehealthSession = computed(() => (
  String(requestType.value || '') === 'individual_session'
  && String(bookingModality.value || '').toUpperCase() === 'TELEHEALTH'
));
const virtualSessionSelectedClientIdSet = computed(
  () => new Set((virtualSessionSelectedClientIds.value || []).map((n) => Number(n || 0)).filter((n) => n > 0))
);
const virtualSessionSelectedGuardianKeySet = computed(
  () => new Set((virtualSessionSelectedGuardianKeys.value || []).map((k) => String(k || '').trim()).filter(Boolean))
);
const virtualSessionSelectedCount = computed(() => (
  virtualSessionSelectedClientIdSet.value.size + virtualSessionSelectedGuardianKeySet.value.size
));
const virtualSessionIsGroup = computed(() => virtualSessionSelectedClientIdSet.value.size > 1);
const primarySessionClientId = computed(() => {
  const ids = Array.from(virtualSessionSelectedClientIdSet.value.values());
  return ids.length ? Number(ids[0]) : null;
});
const primarySessionClientLabel = computed(() => {
  const id = Number(primarySessionClientId.value || 0);
  if (!id) return '';
  const row = (virtualSessionClients.value || []).find((c) => Number(c?.id || 0) === id);
  return String(row?.displayName || `Client ${id}`).trim();
});
const virtualSessionGuardianKey = (guardian) => `${Number(guardian?.userId || 0)}:${Number(guardian?.clientId || 0)}`;
const virtualSessionClientRoleLabel = (client) => {
  const type = String(client?.clientType || '').trim();
  const status = String(client?.statusLabel || client?.statusKey || '').trim();
  const parts = [];
  if (type) parts.push(type.replace(/_/g, ' '));
  if (status) parts.push(status);
  return parts.length ? parts.join(' · ') : 'client';
};
const filterVirtualSessionRows = (rows, labelKeys = ['displayName', 'fullName', 'initials', 'identifierCode', 'email']) => {
  const q = String(virtualSessionParticipantSearch.value || '').trim().toLowerCase();
  const list = Array.isArray(rows) ? rows : [];
  if (!q) return list;
  return list.filter((row) => labelKeys.some((key) => String(row?.[key] || '').trim().toLowerCase().includes(q)));
};
const filteredVirtualSessionClients = computed(() => filterVirtualSessionRows(virtualSessionClients.value));
const filteredVirtualSessionGuardians = computed(() => filterVirtualSessionRows(
  virtualSessionGuardians.value,
  ['displayName', 'firstName', 'lastName', 'email', 'clientName']
));
const virtualSessionParticipantChips = computed(() => {
  const clientById = new Map((virtualSessionClients.value || []).map((c) => [Number(c.id), c]));
  const guardianByKey = new Map((virtualSessionGuardians.value || []).map((g) => [virtualSessionGuardianKey(g), g]));
  const chips = [];
  for (const id of virtualSessionSelectedClientIdSet.value.values()) {
    const row = clientById.get(id);
    chips.push({
      key: `client-${id}`,
      kind: 'client',
      id,
      label: row?.displayName || `Client ${id}`
    });
  }
  for (const key of virtualSessionSelectedGuardianKeySet.value.values()) {
    const row = guardianByKey.get(key);
    chips.push({
      key: `guardian-${key}`,
      kind: 'guardian',
      guardianKey: key,
      label: row?.displayName || 'Guardian'
    });
  }
  return chips;
});
const virtualSessionSummaryTypeLabel = computed(() => {
  if (isVirtualTelehealthSession.value && linkPlatformVideoRoom.value) {
    return virtualSessionIsGroup.value ? 'Group virtual session' : 'Individual virtual session';
  }
  return selectedQuickActionLabel.value;
});
const showSessionOfficeBookingPanel = computed(() => {
  const t = String(requestType.value || '');
  const hasOffice = Number(selectedOfficeLocationId.value || 0) > 0;
  const modality = String(bookingModality.value || '').toUpperCase();
  // Pure virtual sessions are not office bookings — only show room UI when the user opts in.
  if (t === 'individual_session' && modality === 'TELEHEALTH') {
    return sessionAlsoRequestOffice.value && hasOffice;
  }
  return t === 'office'
    || t === 'office_request_only'
    || t === 'group_session'
    || (t === 'individual_session' && modality === 'IN_PERSON' && hasOffice);
});
const toggleVirtualSessionClient = (clientId) => {
  const id = Number(clientId || 0);
  if (!id) return;
  // Individual sessions attach exactly one client; group bookings use the Group session action.
  if (String(requestType.value || '') === 'individual_session') {
    const current = Number(primarySessionClientId.value || 0);
    virtualSessionSelectedClientIds.value = current === id ? [] : [id];
    return;
  }
  const next = new Set((virtualSessionSelectedClientIds.value || []).map((n) => Number(n || 0)).filter((n) => n > 0));
  if (next.has(id)) next.delete(id);
  else next.add(id);
  virtualSessionSelectedClientIds.value = Array.from(next.values());
};
const toggleVirtualSessionGuardian = (guardian) => {
  const key = virtualSessionGuardianKey(guardian);
  if (!key || key === '0:0') return;
  const next = new Set((virtualSessionSelectedGuardianKeys.value || []).map((k) => String(k || '').trim()).filter(Boolean));
  if (next.has(key)) next.delete(key);
  else next.add(key);
  virtualSessionSelectedGuardianKeys.value = Array.from(next.values());
};
const addAllFilteredVirtualSessionParticipants = () => {
  const clientNext = new Set((virtualSessionSelectedClientIds.value || []).map((n) => Number(n || 0)).filter((n) => n > 0));
  for (const row of (filteredVirtualSessionClients.value || [])) {
    const id = Number(row?.id || 0);
    if (id > 0) clientNext.add(id);
  }
  virtualSessionSelectedClientIds.value = Array.from(clientNext.values());
  if (virtualSessionIncludeGuardians.value) {
    const guardianNext = new Set((virtualSessionSelectedGuardianKeys.value || []).map((k) => String(k || '').trim()).filter(Boolean));
    for (const row of (filteredVirtualSessionGuardians.value || [])) {
      const key = virtualSessionGuardianKey(row);
      if (key && key !== '0:0') guardianNext.add(key);
    }
    virtualSessionSelectedGuardianKeys.value = Array.from(guardianNext.values());
  }
};
const clearVirtualSessionParticipants = () => {
  virtualSessionSelectedClientIds.value = [];
  virtualSessionSelectedGuardianKeys.value = [];
};
const removeVirtualSessionParticipant = (chip) => {
  if (!chip) return;
  if (chip.kind === 'client') {
    const id = Number(chip.id || 0);
    virtualSessionSelectedClientIds.value = (virtualSessionSelectedClientIds.value || [])
      .map((n) => Number(n || 0))
      .filter((n) => n > 0 && n !== id);
    return;
  }
  const key = String(chip.guardianKey || '').trim();
  if (!key) return;
  virtualSessionSelectedGuardianKeys.value = (virtualSessionSelectedGuardianKeys.value || [])
    .map((k) => String(k || '').trim())
    .filter((k) => k && k !== key);
};
const resetVirtualSessionShareState = () => {
  virtualSessionShareUrl.value = '';
  virtualSessionShareCopied.value = false;
  virtualSessionScheduledSessionKey.value = '';
  virtualSessionGoogleWarning.value = '';
};
const buildVirtualSessionShareUrl = (sharePath) => {
  const path = String(sharePath || '').trim();
  if (!path) return '';
  const origin = window.location.origin;
  const slug = String(
    route.params.organizationSlug ||
      agencyStore?.currentAgency?.slug ||
      agencyStore?.currentAgency?.portal_url ||
      ''
  ).trim();
  if (slug && path.startsWith('/counseling/')) {
    return `${origin}/${slug}${path}`;
  }
  return `${origin}${path}`;
};
const copyVirtualSessionShareUrl = async () => {
  if (!virtualSessionShareUrl.value) return;
  try {
    await navigator.clipboard.writeText(virtualSessionShareUrl.value);
    virtualSessionShareCopied.value = true;
    setTimeout(() => {
      virtualSessionShareCopied.value = false;
    }, 2000);
  } catch {
    /* ignore */
  }
};
const ensureScheduleAgencyVisible = (agencyId) => {
  const id = Number(agencyId || 0);
  if (!id) return;
  const existing = (selfScheduleAgencyOptions.value || []).some((row) => Number(row?.id || 0) === id);
  if (!existing) {
    const fromBooking = (bookingAgencyOptions.value || []).find((row) => Number(row?.id || 0) === id);
    const fromStore = (agencyStore.agencies || []).find((row) => Number(row?.id || 0) === id)
      || (Number(agencyStore.currentAgency?.id || 0) === id ? agencyStore.currentAgency : null);
    const source = fromBooking || fromStore;
    if (source) {
      selfScheduleAgencyOptions.value = [
        ...(selfScheduleAgencyOptions.value || []),
        {
          id,
          name: String(source.label || source.name || `Agency ${id}`).trim(),
          organization_type: source.organizationType || source.organization_type || 'agency',
          hasClinicalOrg: !!source.hasClinicalOrg,
          hasLearningOrg: !!source.hasLearningOrg,
          medicalBillingEnabled: source.medicalBillingEnabled === true
            || isMedicalBillingEnabled(source.featureFlags || source.feature_flags),
          featureFlags: source.featureFlags || source.feature_flags || null
        }
      ];
    }
  }
  const active = new Set((activeScheduleAgencyIds.value || []).map((n) => Number(n || 0)).filter((n) => n > 0));
  if (!active.has(id)) {
    activeScheduleAgencyIds.value = [...active, id];
  }
};

const patchScheduleSummaryWithBookedEvent = ({
  eventId = null,
  agencyId = null,
  title = '',
  startAt = '',
  endAt = '',
  kind = 'PERSONAL_EVENT'
}) => {
  const normalizeWall = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return '';
    return s.includes('T') ? s.slice(0, 19) : s.replace(' ', 'T').slice(0, 19);
  };
  const start = normalizeWall(startAt);
  const end = normalizeWall(endAt);
  if (!start || !end) return;
  const aId = Number(agencyId || 0) || null;
  const ev = {
    id: Number(eventId || 0) || null,
    agencyId: aId,
    _agencyId: aId,
    kind: String(kind || 'PERSONAL_EVENT').trim().toUpperCase(),
    title: String(title || '').trim() || 'Virtual session',
    isPrivate: false,
    allDay: false,
    startAt: start,
    endAt: end
  };
  const base = summary.value && typeof summary.value === 'object'
    ? { ...summary.value }
    : { weekStart: weekStart.value, scheduleEvents: [], officeEvents: [], officeRequests: [], schoolRequests: [], schoolAssignments: [], supervisionSessions: [] };
  const list = Array.isArray(base.scheduleEvents) ? [...base.scheduleEvents] : [];
  const sig = `${ev.kind}|${ev.startAt}|${ev.endAt}|${ev.title}|${ev.id || ''}`;
  const exists = list.some((row) => {
    const rowSig = `${String(row?.kind || '').toUpperCase()}|${normalizeWall(row?.startAt)}|${normalizeWall(row?.endAt)}|${String(row?.title || '').trim()}|${Number(row?.id || 0) || ''}`;
    return rowSig === sig;
  });
  if (!exists) list.push(ev);
  summary.value = { ...base, scheduleEvents: list };
};

const refreshScheduleSummaryInBackground = () => {
  invalidateScheduleSummaryCacheForUser(props.userId);
  void load({ forceRefresh: true });
};

const loadVirtualSessionClients = async (agencyIdOverride = null) => {
  const uid = Number(scheduleActorUserId.value || props.userId || authStore.user?.id || 0);
  const agencyId = Number(agencyIdOverride || effectiveAgencyId.value || 0);
  if (!uid || !agencyId) {
    virtualSessionClients.value = [];
    virtualSessionGuardians.value = [];
    return;
  }
  try {
    virtualSessionClientsLoading.value = true;
    const r = await api.get(`/users/${uid}/virtual-session-clients`, {
      params: {
        agencyId,
        includeGuardians: virtualSessionIncludeGuardians.value ? 'true' : 'false'
      }
    });
    virtualSessionClients.value = Array.isArray(r?.data?.clients) ? r.data.clients : [];
    virtualSessionGuardians.value = Array.isArray(r?.data?.guardians) ? r.data.guardians : [];
  } catch {
    virtualSessionClients.value = [];
    virtualSessionGuardians.value = [];
  } finally {
    virtualSessionClientsLoading.value = false;
  }
};

const hasBusyOverlapInSummary = (summaryPayload, ranges = []) => {
  const targetRanges = Array.isArray(ranges) ? ranges : [];
  if (!targetRanges.length) return false;
  const toDate = (v) => {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const overlaps = (startAt, endAt) => {
    const st = toDate(startAt);
    const en = toDate(endAt);
    if (!st || !en) return false;
    return targetRanges.some((r) => st < r.end && en > r.start);
  };

  const officeEvents = Array.isArray(summaryPayload?.officeEvents) ? summaryPayload.officeEvents : [];
  if (officeEvents.some((e) => overlaps(e?.startAt, e?.endAt))) return true;
  const scheduleEvents = Array.isArray(summaryPayload?.scheduleEvents) ? summaryPayload.scheduleEvents : [];
  if (scheduleEvents.some((e) => overlaps(e?.startAt, e?.endAt))) return true;
  const supervisionSessions = Array.isArray(summaryPayload?.supervisionSessions) ? summaryPayload.supervisionSessions : [];
  if (supervisionSessions.some((e) => overlaps(e?.startAt, e?.endAt))) return true;
  const googleBusy = Array.isArray(summaryPayload?.googleBusy) ? summaryPayload.googleBusy : [];
  if (googleBusy.some((e) => overlaps(e?.startAt, e?.endAt))) return true;
  const externalBusy = Array.isArray(summaryPayload?.externalBusy) ? summaryPayload.externalBusy : [];
  if (externalBusy.some((e) => overlaps(e?.startAt, e?.endAt))) return true;
  return false;
};

const loadMeetingBusyByParticipant = async () => {
  const ids = (availableMeetingCandidates.value || []).map((r) => Number(r?.id || 0)).filter((n) => n > 0);
  if (!ids.length) {
    meetingBusyByUserId.value = {};
    return;
  }
  const ranges = mergeSelectedSlotsByDay({ dayName: modalDay.value, startHour: Number(effectiveModalStartHour.value || modalHour.value), endHour: Number(modalEndHour.value) })
    .map((row) => {
      const dateYmd = String(row?.dateYmd || '').slice(0, 10);
      const startHour = Number(row?.startHour || 0);
      const endHour = Number(row?.endHour || 0);
      const startMinute = canUseQuarterHourInput.value ? Number(modalStartMinute.value || 0) : 0;
      const endMinute = canUseQuarterHourInput.value ? Number(modalEndMinute.value || 0) : 0;
      const start = new Date(`${dateYmd}T${pad2(startHour)}:${pad2(startMinute)}:00`);
      const end = new Date(`${dateYmd}T${pad2(endHour)}:${pad2(endMinute)}:00`);
      return Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ? null : { start, end };
    })
    .filter(Boolean);
  if (!ranges.length) {
    meetingBusyByUserId.value = {};
    return;
  }
  meetingBusyLoading.value = true;
  try {
    const entries = await Promise.all(
      ids.map(async (id) => {
        try {
          const params = {
            weekStart: weekStart.value,
            includeGoogleBusy: props.hideOfficeAndCalendarIntegration ? 'false' : (showGoogleBusy.value ? 'true' : 'false')
          };
          if (!meetingUsingAllAgencies.value && Number(effectiveAgencyId.value || 0) > 0) {
            params.agencyId = Number(effectiveAgencyId.value);
          }
          const r = await api.get(`/users/${id}/schedule-summary`, { params });
          const busy = hasBusyOverlapInSummary(r?.data || {}, ranges);
          return [id, busy];
        } catch {
          return [id, false];
        }
      })
    );
    meetingBusyByUserId.value = Object.fromEntries(entries);
  } finally {
    meetingBusyLoading.value = false;
  }
};

const loadMeetingCandidates = async () => {
  const uid = Number(props.userId || authStore.user?.id || 0);
  if (!uid) return;
  const useAllAgencies = meetingUsingAllAgencies.value;
  if (!useAllAgencies && !effectiveAgencyId.value) return;
  try {
    meetingCandidatesLoading.value = true;
    const params = {
      allAgencies: useAllAgencies ? 'true' : 'false'
    };
    if (!useAllAgencies) params.agencyId = Number(effectiveAgencyId.value || 0);
    const r = await api.get(`/users/${uid}/meeting-candidates`, { params });
    meetingCandidates.value = Array.isArray(r?.data?.users) ? r.data.users : [];
  } catch {
    meetingCandidates.value = [];
  } finally {
    meetingCandidatesLoading.value = false;
  }
  await loadMeetingBusyByParticipant();
};

const loadSupervisionProviders = async () => {
  if (!authStore.user?.id) return;
  if (!supervisionUsingAllAgencies.value && !effectiveAgencyId.value) return;
  try {
    supervisionProvidersLoading.value = true;
    const params = {
      mode: isGroupSupervisionType.value ? 'group' : 'individual',
      allAgencies: supervisionUsingAllAgencies.value ? 'true' : 'false'
    };
    if (!supervisionUsingAllAgencies.value) params.agencyId = effectiveAgencyId.value;
    const r = await api.get('/supervision/providers', {
      params
    });
    supervisionProviders.value = Array.isArray(r?.data?.providers) ? r.data.providers : [];
    const candidates = availableSupervisionParticipants.value;
    const viewedUserId = Number(props.userId || 0);
    const actorId = Number(authStore.user?.id || 0);
    const viewedIsSelectable = viewedUserId > 0 && viewedUserId !== actorId && candidates.some((row) => Number(row?.id || 0) === viewedUserId);
    if (!selectedSupervisionParticipantId.value) {
      if (viewedIsSelectable) {
        selectedSupervisionParticipantId.value = viewedUserId;
      } else if (candidates.length === 1) {
        selectedSupervisionParticipantId.value = Number(candidates[0].id || 0);
      }
    }
  } catch {
    supervisionProviders.value = [];
  } finally {
    supervisionProvidersLoading.value = false;
  }
};

const effectiveModalStartHour = computed(() =>
  canUseQuarterHourInput.value ? Number(modalStartHour.value || modalHour.value || 0) : Number(modalHour.value || 0)
);
const modalGridMaxEnd = computed(() => gridMaxHour.value);
const startHourOptions = computed(() => {
  const clicked = Number(modalHour.value || 0);
  if (!canUseQuarterHourInput.value) return [clicked];
  const minH = Math.max(gridMinHour.value, clicked - 1);
  const out = [];
  for (let h = minH; h <= clicked; h++) out.push(h);
  return out;
});
const endHourOptions = computed(() => {
  const start = Number(effectiveModalStartHour.value || modalHour.value || 0);
  const maxEnd = modalGridMaxEnd.value;
  const out = [];
  const first = canUseQuarterHourInput.value ? start : (start + 1);
  for (let h = first; h <= maxEnd; h++) out.push(h);
  return out;
});

const ensureModalEndTimeValid = () => {
  const maxEnd = modalGridMaxEnd.value;
  if (canUseQuarterHourInput.value) {
    const allowed = startHourOptions.value;
    let sh = Number(modalStartHour.value || modalHour.value || 0);
    if (!allowed.includes(sh)) modalStartHour.value = allowed[allowed.length - 1] ?? sh;
  }
  const startH = Number(effectiveModalStartHour.value || modalHour.value || 0);
  const minEndH = canUseQuarterHourInput.value ? startH : (startH + 1);
  let endH = Number(modalEndHour.value || 0);
  if (endH < minEndH) endH = minEndH;
  if (endH > maxEnd) endH = maxEnd;
  modalEndHour.value = endH;

  const normalizedStartMinute = quarterMinuteOptions.includes(Number(modalStartMinute.value)) ? Number(modalStartMinute.value) : 0;
  modalStartMinute.value = normalizedStartMinute;

  const allowedEndMinutes = endMinuteOptions.value;
  let endMinute = Number(modalEndMinute.value || 0);
  if (!allowedEndMinutes.includes(endMinute)) endMinute = allowedEndMinutes[0] ?? 0;

  const startTotal = startH * 60 + (canUseQuarterHourInput.value ? normalizedStartMinute : 0);
  let endTotal = endH * 60 + (canUseQuarterHourInput.value ? endMinute : 0);
  if (endTotal <= startTotal) {
    if (canUseQuarterHourInput.value) {
      endTotal = Math.min(maxEnd * 60, startTotal + 15);
      modalEndHour.value = Math.floor(endTotal / 60);
      const rem = endTotal % 60;
      const normalizedRem = quarterMinuteOptions.includes(rem) ? rem : 0;
      modalEndMinute.value = Math.min(...quarterMinuteOptions.filter((m) => m >= normalizedRem), 45);
      if (Number(modalEndHour.value) >= maxEnd) modalEndMinute.value = 0;
      return;
    }
    modalEndHour.value = Math.min(maxEnd, startH + 1);
    modalEndMinute.value = 0;
    return;
  }
  modalEndMinute.value = canUseQuarterHourInput.value ? endMinute : 0;
  if (!canUseQuarterHourInput.value) modalStartMinute.value = 0;
};

const isWeekdayName = (dayName) => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(String(dayName || ''));
/** Unwrap Vue refs if a caller accidentally passes them (Number(ref) === NaN). */
const plainValue = (v) => (v && typeof v === 'object' && v.__v_isRef ? v.value : v);
const canUseSchool = (dayName, startHour, endHour) => {
  const day = String(plainValue(dayName) || '').trim();
  const sh = Number(plainValue(startHour));
  const eh = Number(plainValue(endHour));
  if (!isWeekdayName(day)) return false;
  if (!Number.isFinite(sh) || !Number.isFinite(eh)) return false;
  if (!(eh > sh)) return false;
  // School daytime availability must be between 06:00 and 18:00.
  return sh >= 6 && eh <= 18;
};
const schoolWindowValid = computed(() =>
  canUseSchool(modalDay.value, effectiveModalStartHour.value, modalEndHour.value)
);

const actionSlotKey = ({ dateYmd, hour, roomId = 0 }) => `${String(dateYmd).slice(0, 10)}|${Number(hour)}|${Number(roomId || 0)}`;
const parseActionSlotKey = (key) => {
  const [d, h, r] = String(key || '').split('|');
  return {
    dateYmd: String(d || ''),
    hour: Number(h || 0),
    roomId: Number(r || 0)
  };
};

const buildModalContext = ({ dayName, hour, roomId = 0, slot = null, dateYmd = null }) => {
  // In office_layout, scope to selected office + room so each cell is treated as that specific room
  const officeFilter = viewMode.value === 'office_layout' && Number(selectedOfficeLocationId.value || 0) > 0
    ? selectedOfficeLocationId.value
    : null;
  const roomFilter = viewMode.value === 'office_layout' && Number(roomId || 0) > 0 ? Number(roomId) : null;
  const top = officeTopEvent(dayName, hour, officeFilter, roomFilter) || null;
  const rawState = String(
    slot?.state
    || slot?.slotState
    || slot?.slot_state
    || top?.slotState
    || top?.slot_state
    || ''
  ).trim().toUpperCase();
  const resolvedRoomId = Number(roomId || slot?.roomId || slot?.room_id || top?.roomId || 0) || null;
  const rooms = Array.isArray(officeGrid.value?.rooms) ? officeGrid.value.rooms : [];
  const roomRow = resolvedRoomId
    ? rooms.find((r) => Number(r?.id) === Number(resolvedRoomId))
    : null;
  const roomNum = roomRow?.roomNumber ?? roomRow?.room_number ?? null;
  const roomLabel = roomRow
    ? [`${roomNum != null && String(roomNum).trim() !== '' ? `#${String(roomNum).trim()} ` : ''}${String(roomRow?.label || roomRow?.name || '').trim()}`.trim()].filter(Boolean)[0]
    : (String(slot?.roomLabel || slot?.room_label || '').trim() || null);
  const prettyType = (code) => {
    const c = String(code || '').trim();
    if (!c || c.toUpperCase() === 'NONE') return null;
    return c.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
  };
  return {
    dayName: String(dayName),
    dateYmd: String(dateYmd || addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dayName))).slice(0, 10),
    hour: Number(hour),
    agencyId: Number(slot?._agencyId || top?._agencyId || 0) || null,
    officeEventId: Number(slot?.eventId || slot?.officeEventId || top?.id || 0) || null,
    officeLocationId: Number(
      slot?.officeLocationId
      || slot?.office_location_id
      || top?.buildingId
      || selectedOfficeLocationId.value
      || 0
    ) || null,
    roomId: resolvedRoomId,
    roomLabel: roomLabel || (resolvedRoomId ? `Room ${resolvedRoomId}` : null),
    assignedProviderId: Number(slot?.assignedProviderId || top?.assignedProviderId || 0) || null,
    bookedProviderId: Number(slot?.bookedProviderId || top?.bookedProviderId || 0) || null,
    assignedFrequency: String(slot?.assignedFrequency || top?.assignedFrequency || '').toUpperCase() || null,
    bookedFrequency: String(slot?.bookedFrequency || top?.bookedFrequency || '').toUpperCase() || null,
    frequencyLabel: String(slot?.frequencyLabel || top?.frequencyLabel || '').trim() || null,
    standingAssignmentId: Number(slot?.standingAssignmentId || top?.standingAssignmentId || 0) || null,
    bookingPlanId: Number(slot?.bookingPlanId || 0) || null,
    learningSessionId: Number(slot?.learningSessionId || 0) || null,
    clinicalSessionId: Number(slot?.clinicalSessionId || 0) || null,
    assignmentAvailabilityMode: String(slot?.assignmentAvailabilityMode || top?.assignmentAvailabilityMode || '').toUpperCase() || null,
    assignmentAvailableSinceDate: String(slot?.assignmentAvailableSinceDate || top?.assignmentAvailableSinceDate || '').slice(0, 10) || null,
    assignmentTemporaryUntilDate: String(slot?.assignmentTemporaryUntilDate || top?.assignmentTemporaryUntilDate || '').slice(0, 10) || null,
    bookingActiveUntilDate: String(slot?.bookingActiveUntilDate || top?.bookingActiveUntilDate || '').slice(0, 10) || null,
    bookingStartDate: String(slot?.bookingStartDate || top?.bookingStartDate || '').slice(0, 10) || null,
    assignmentTemporaryExtensionCount: Number(slot?.assignmentTemporaryExtensionCount ?? top?.assignmentTemporaryExtensionCount ?? 0),
    assignmentCreatedByName: String(slot?.assignmentCreatedByName || '').trim() || null,
    bookingCreatedByName: String(slot?.bookingCreatedByName || '').trim() || null,
    slotState: rawState,
    virtualIntakeEnabled: (slot?.virtualIntakeEnabled === true) || (top?.virtualIntakeEnabled === true),
    inPersonIntakeEnabled: (slot?.inPersonIntakeEnabled === true) || (top?.inPersonIntakeEnabled === true),
    assignedProviderName: String(slot?.assignedProviderFullName || slot?.assignedProviderName || top?.assignedProviderFullName || top?.assignedProviderName || '').trim() || null,
    bookedProviderName: String(slot?.bookedProviderFullName || slot?.bookedProviderName || top?.bookedProviderFullName || top?.bookedProviderName || '').trim() || null,
    appointmentType: String(slot?.appointmentType || top?.appointmentType || '').trim().toUpperCase() || null,
    appointmentTypeLabel: prettyType(slot?.appointmentType || top?.appointmentType),
    appointmentSubtype: String(slot?.appointmentSubtype || top?.appointmentSubtype || '').trim().toUpperCase() || null,
    appointmentSubtypeLabel: prettyType(slot?.appointmentSubtype || top?.appointmentSubtype),
    serviceCode: String(slot?.serviceCode || top?.serviceCode || '').trim().toUpperCase() || null,
    modality: String(slot?.modality || top?.modality || '').trim().toUpperCase() || null,
    modalityLabel: prettyType(slot?.modality || top?.modality),
    statusOutcome: String(slot?.statusOutcome || '').trim().toUpperCase() || null
  };
};

const sortedSelectedActionSlots = () => {
  const rows = (selectedActionSlots.value || []).slice();
  rows.sort((a, b) => {
    const da = String(a.dateYmd || '');
    const db = String(b.dateYmd || '');
    if (da !== db) return da.localeCompare(db);
    if (Number(a.hour || 0) !== Number(b.hour || 0)) return Number(a.hour || 0) - Number(b.hour || 0);
    return Number(a.roomId || 0) - Number(b.roomId || 0);
  });
  return rows;
};

const selectedActionSignature = (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .map((x) => String(x?.key || ''))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .join('|');
};

const maybeAutoOpenSelectionActions = (opts = {}) => {
  if (!canBookFromGrid.value || showRequestModal.value) return;
  const rows = sortedSelectedActionSlots();
  if (rows.length <= 1) return;
  const sig = selectedActionSignature(rows);
  if (!sig || sig === lastAutoOpenedSelectionSignature.value) return;
  lastAutoOpenedSelectionSignature.value = sig;
  if (viewMode.value === 'office_layout') {
    if (resolveOfficeMultiSelectionActions(rows, opts?.preferredFirstKey || '')) return;
  }
  openSlotActionModal({ ...rows[0], actionSource: 'plus_or_blank' });
};

const openSlotActionModal = ({
  dayName,
  hour,
  roomId = 0,
  slot = null,
  dateYmd = null,
  preserveSelectionRange = true,
  initialRequestType = '',
  initialModality = '',
  actionSource = 'general'
} = {}) => {
  if (!canBookFromGrid.value) return;
  modalActionSource.value = String(actionSource || 'general');
  modalDay.value = String(dayName);
  modalHour.value = Number(hour);
  modalStartHour.value = Number(hour);
  // Default to a 1-hour range; clamp to end-of-grid.
  // Multi-hour highlight is applied below BEFORE requestType so admin_assign syncs the full span.
  const maxEnd = modalGridMaxEnd.value;
  const nextEnd = Math.min(Number(hour) + 1, maxEnd);
  modalEndHour.value = nextEnd > Number(hour) ? nextEnd : Math.min(Number(hour) + 1, maxEnd);
  if (preserveSelectionRange) {
    const rows = sortedSelectedActionSlots();
    if (rows.length > 1) {
      const sameDay = rows.every((x) => String(x.dateYmd || '') === String(rows[0]?.dateYmd || ''));
      if (sameDay) {
        const minHour = Math.min(...rows.map((x) => Number(x.hour || 0)));
        const maxHour = Math.max(...rows.map((x) => Number(x.hour || 0)));
        if (Number.isFinite(minHour) && Number.isFinite(maxHour)) {
          modalHour.value = minHour;
          modalStartHour.value = minHour;
          modalEndHour.value = Math.min(maxHour + 1, maxEnd);
        }
      }
    }
  }
  // Keep admin-assign end time in lockstep with the modal range (header uses modal*; form uses officeAssign*).
  officeAssignStartHour.value = Number(modalHour.value || 0);
  officeAssignEndHour.value = Math.max(
    Number(modalEndHour.value || 0),
    Number(modalHour.value || 0) + 1
  );
  const normalizedInitialRequestType = String(initialRequestType || '').trim();
  requestType.value = normalizedInitialRequestType || '';
  requestTypeChosenByUser.value = Boolean(normalizedInitialRequestType);
  requestNotes.value = '';
  scheduleEventTitle.value = '';
  scheduleEventAllDay.value = false;
  scheduleEventPrivate.value = false;
  scheduleEventRecurrence.value = 'ONCE';
  scheduleEventRecurrenceEndMode.value = 'count';
  scheduleEventOccurrenceCount.value = 6;
  supervisionRecurrence.value = 'ONCE';
  supervisionRecurrenceEndMode.value = 'count';
  supervisionOccurrenceCount.value = 6;
  modalStartMinute.value = 0;
  modalEndMinute.value = 0;
  scheduleHoldReasonCode.value = 'DOCUMENTATION';
  scheduleHoldCustomReason.value = '';
  modalError.value = '';
  forfeitScope.value = 'occurrence';
  ackForfeit.value = false;
  officeBookingRecurrence.value = 'ONCE';
  officeBookingOccurrenceCount.value = 6;
  selectedOfficeRoomId.value = viewMode.value === 'office_layout' ? (Number(roomId || 0) || 0) : 0;
  resetBookingSelectionDefaults();
  sessionAlsoRequestOffice.value = false;
  const modality = String(initialModality || '').trim().toUpperCase();
  if (modality === 'TELEHEALTH' || modality === 'IN_PERSON') {
    bookingModality.value = modality;
  } else if (normalizedInitialRequestType === 'individual_session') {
    bookingModality.value = 'TELEHEALTH';
  }
  resetBookingMetadataState();
  linkPlatformVideoRoom.value = true;
  virtualSessionParticipantSearch.value = '';
  virtualSessionSelectedClientIds.value = [];
  virtualSessionSelectedGuardianKeys.value = [];
  virtualSessionIncludeGuardians.value = false;
  resetVirtualSessionShareState();
  supervisionParticipantSearch.value = '';
  supervisionIncludeAllAgencies.value = false;
  selectedSupervisionParticipantId.value = 0;
  selectedSupervisionAdditionalParticipantIds.value = [];
  createSupervisionMeetLink.value = true;
  meetingParticipantSearch.value = '';
  selectedMeetingParticipantIds.value = [];
  meetingIncludeAllAgencies.value = false;
  meetingBusyByUserId.value = {};
  createMeetingMeetLink.value = !scheduleVideoConfigured.value;
  linkMeetingPlatformVideo.value = scheduleVideoConfigured.value;
  createAgendaDraftTitle.value = '';
  createAgendaDraftItems.value = [];
  modalContext.value = buildModalContext({ dayName: modalDay.value, hour: modalHour.value, roomId, slot, dateYmd });
  bookingTargetUserId.value = Number(props.userId || authStore.user?.id || 0) || 0;
  if (canSelectBookingProvider.value) {
    void loadBookingProviderDirectory();
  }
  if (isScheduleSuperAdmin.value && !(agencyStore.agencies || []).length) {
    void agencyStore.fetchAgencies().catch(() => {});
  }
  // Pre-fill admin assign person with the schedule's user (works in both self and admin mode)
  if (canManageOffices.value) {
    adminAssignPersonId.value = Number(scheduleActorUserId.value || props.userId || 0);
    adminAssignPersonName.value = '';
    adminAssignPersonSearch.value = '';
  }
  if (modalLockRoomToAssigned.value) {
    selectedOfficeRoomId.value = Number(modalContext.value?.roomId || 0) || 0;
    officeBookingRecurrence.value = 'ONCE';
  }
  const bookingIds = new Set((bookingAgencyOptions.value || []).map((row) => Number(row?.id || 0)).filter((n) => n > 0));
  const contextAgencyId = Number(modalContext.value?.agencyId || 0);
  const currentId = Number(agencyStore.currentAgency?.id || 0);
  if (currentId && bookingIds.has(currentId)) {
    selectedActionAgencyId.value = currentId;
  } else if (contextAgencyId && bookingIds.has(contextAgencyId)) {
    selectedActionAgencyId.value = contextAgencyId;
  } else if (selectedActionAgencyId.value && bookingIds.has(Number(selectedActionAgencyId.value))) {
    // keep
  } else {
    selectedActionAgencyId.value = Number([...bookingIds][0] || effectiveAgencyIds.value[0] || 0) || 0;
  }
  // Office / layout opens always land on the chooser unless a real deep-link action was passed
  // (e.g. portal_intake, school, individual_session from dashboard CTA).
  if (
    modalActionSource.value === 'office_block'
    || modalActionSource.value === 'plus_or_blank'
    || viewMode.value === 'office_layout'
  ) {
    const deepLinkOk = normalizedInitialRequestType
      && !['slot_details', 'office_request_only', ''].includes(normalizedInitialRequestType);
    if (!deepLinkOk) {
      requestType.value = '';
      requestTypeChosenByUser.value = false;
    }
  }
  loadSlotActionPrefs();
  showMoreSlotActions.value = false;
  slotActionReorderMode.value = false;
  const rows = preserveSelectionRange ? sortedSelectedActionSlots() : [];
  // Signature still keyed off selection rows (duration already applied above).
  const fallbackDate = String(dateYmd || addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dayName))).slice(0, 10);
  const fallbackRow = {
    key: actionSlotKey({ dateYmd: fallbackDate, hour: Number(modalHour.value || hour), roomId }),
    dateYmd: fallbackDate,
    dayName: String(dayName || ''),
    hour: Number(modalHour.value || hour || 0),
    roomId: Number(roomId || 0)
  };
  lastAutoOpenedSelectionSignature.value = selectedActionSignature(rows.length ? rows : [fallbackRow]);
  showRequestModal.value = true;
  void loadBookingMetadataForProvider();
  void loadSupervisionProviders();
  void ensureOfficeAgencyIds(Number(modalContext.value?.officeLocationId || selectedOfficeLocationId.value || 0));
};

const applyShiftSelection = (current) => {
  const last = parseActionSlotKey(lastSelectedActionKey.value);
  if (!last.dateYmd) return false;
  if (Number(last.roomId || 0) !== Number(current.roomId || 0)) return false;
  const startDate = String(last.dateYmd || '');
  const endDate = String(current.dateYmd || '');
  const minDate = startDate <= endDate ? startDate : endDate;
  const maxDate = startDate <= endDate ? endDate : startDate;
  const minHour = Math.min(Number(last.hour || 0), Number(current.hour || 0));
  const maxHour = Math.max(Number(last.hour || 0), Number(current.hour || 0));
  const next = new Map((selectedActionSlots.value || []).map((x) => [x.key, x]));
  let added = 0;
  for (let d = new Date(`${minDate}T00:00:00`); !Number.isNaN(d.getTime()) && String(localYmd(d)) <= maxDate; d.setDate(d.getDate() + 1)) {
    const ymd = localYmd(d);
    for (let h = minHour; h <= maxHour; h += 1) {
      const key = actionSlotKey({ dateYmd: ymd, hour: h, roomId: current.roomId });
      if (next.has(key)) continue;
      const item = viewMode.value === 'office_layout'
        ? officeLayoutSelectionItem(ymd, h, current.roomId)
        : {
          key,
          dateYmd: ymd,
          dayName: dayNameForDateYmd(ymd) || current.dayName,
          hour: h,
          roomId: Number(current.roomId || 0),
          slot: null
        };
      next.set(key, item);
      added += 1;
    }
  }
  selectedActionSlots.value = Array.from(next.values());
  return added > 0;
};

const onCellClick = (dayName, hour, event = null, options = {}) => {
  if (suppressClickAfterDrag.value) {
    suppressClickAfterDrag.value = false;
    return;
  }
  const dateYmd = String(options?.dateYmd || addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dayName))).slice(0, 10);
  const roomId = Number(options?.roomId || 0) || 0;
  const slot = options?.slot || null;
  const item = {
    key: actionSlotKey({ dateYmd, hour, roomId }),
    dateYmd,
    dayName: String(dayName),
    hour: Number(hour),
    roomId,
    slot
  };
  const withSelection = !!(event?.metaKey || event?.ctrlKey || event?.shiftKey);
  if (withSelection) {
    selectedBlockKey.value = ''; // whole-cell selection, not a specific block
    if (event?.shiftKey) {
      const changed = applyShiftSelection(item);
      if (!changed) {
        selectedActionSlots.value = [item];
      }
    } else {
      const next = new Map((selectedActionSlots.value || []).map((x) => [x.key, x]));
      if (next.has(item.key)) next.delete(item.key);
      else next.set(item.key, item);
      selectedActionSlots.value = Array.from(next.values());
    }
    lastSelectedActionKey.value = item.key;
    if (event?.shiftKey) nextTick(() => maybeAutoOpenSelectionActions());
    return;
  }
  selectedBlockKey.value = ''; // whole-cell selection
  selectedActionSlots.value = [item];
  lastSelectedActionKey.value = item.key;
  if (viewMode.value === 'office_layout' && roomId > 0 && canBookFromGrid.value) {
    // Office layout: resolve state for THIS specific room (not the whole row)
    const officeId = Number(selectedOfficeLocationId.value || 0) || null;
    const clickedSlotState = String(
      slot?.slotState
      || slot?.slot_state
      || slot?.state
      || ''
    ).trim().toUpperCase();
    const clickedSlotHasContext = Number(slot?.eventId || slot?.officeEventId || 0) > 0
      || Number(slot?.standingAssignmentId || 0) > 0;
    // Prefer the exact clicked room slot from weekly-grid when it has actionable context.
    // Using summary-derived top events here can mismatch room/state and break forfeit actions.
    if (slot && clickedSlotHasContext && clickedSlotState && clickedSlotState !== 'OPEN') {
      openSlotActionModal({
        dayName,
        hour,
        roomId,
        dateYmd,
        slot,
        preserveSelectionRange: false,
        initialRequestType: '',
        actionSource: 'office_block'
      });
      return;
    }
    const officeTop = officeId ? officeTopEvent(dayName, hour, officeId, roomId) : null;
    if (officeTop) {
      // Assigned/booked room — open same schedule modal on the action chooser
      openSlotActionModal({
        dayName,
        hour,
        roomId: Number(officeTop?.roomId || 0) || 0,
        dateYmd,
        slot: officeTop,
        preserveSelectionRange: false,
        initialRequestType: '',
        actionSource: 'office_block'
      });
    } else {
      // Open or someone else's – show request modal
      openSlotActionModal({ ...item, preserveSelectionRange: false, actionSource: 'plus_or_blank' });
    }
  } else if (isCellVisuallyBlank(dayName, hour)) {
    openSlotActionModal({ ...item, preserveSelectionRange: false, actionSource: 'plus_or_blank' });
  } else if (canBookFromGrid.value) {
    // Cell has content (e.g. user's assigned office slot) – same modal, chooser-first
    const blocks = cellBlocks(dayName, hour);
    const officeBlock = blocks.find((b) => ['oa', 'ot', 'ob', 'intake-ip', 'intake-vi'].includes(String(b?.kind || '')));
    if (officeBlock) {
      const officeId = Number(officeBlock?.buildingId || selectedOfficeLocationId.value || 0) || null;
      const blockRoomId = Number(officeBlock?.roomId || 0) || null;
      const officeTop = officeTopEvent(dayName, hour, officeId, blockRoomId) || null;
      openSlotActionModal({
        dayName,
        hour,
        roomId: Number(officeTop?.roomId || 0) || 0,
        dateYmd,
        slot: officeTop,
        preserveSelectionRange: false,
        initialRequestType: '',
        actionSource: 'office_block'
      });
    }
  }
};

const onCellDoubleClick = (dayName, hour, event = null, options = {}) => {
  if (!canBookFromGrid.value) return;
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const dateYmd = String(options?.dateYmd || addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dayName))).slice(0, 10);
  const roomId = Number(options?.roomId || 0) || 0;
  const slot = options?.slot || null;
  const isOpenForRoom = viewMode.value === 'office_layout' && roomId > 0
    ? !(Number(selectedOfficeLocationId.value || 0) && officeTopEvent(dayName, hour, Number(selectedOfficeLocationId.value || 0), roomId))
    : isCellVisuallyBlank(dayName, hour);
  if (!isOpenForRoom) return;
  const item = {
    key: actionSlotKey({ dateYmd, hour, roomId }),
    dateYmd,
    dayName: String(dayName),
    hour: Number(hour),
    roomId,
    slot
  };
  selectedActionSlots.value = [item];
  lastSelectedActionKey.value = item.key;
  openSlotActionModal({ ...item, preserveSelectionRange: false, actionSource: 'plus_or_blank' });
};

const onCellMouseDown = (dayName, hour, event = null) => {
  if (!canBookFromGrid.value) return;
  if (Number(event?.button) !== 0) return;
  mouseDownClient.value = { x: event?.clientX ?? 0, y: event?.clientY ?? 0 };
  const dateYmd = addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dayName));
  const item = {
    key: actionSlotKey({ dateYmd, hour, roomId: 0 }),
    dateYmd,
    dayName: String(dayName),
    hour: Number(hour),
    roomId: 0,
    slot: null
  };
  isCellDragSelecting.value = false;
  dragAnchorSlot.value = item;
  mouseDownCellKey.value = item.key;
  suppressClickAfterDrag.value = false;
  lastAutoOpenedSelectionSignature.value = '';
};

const onCellMouseEnter = (dayName, hour, event = null) => {
  if (!dragAnchorSlot.value) return;
  if (Number(event?.buttons || 0) !== 1) return;
  // Ignore tiny movements (trackpad/touch) – only treat as drag when moved meaningfully
  const dx = (event?.clientX ?? 0) - mouseDownClient.value.x;
  const dy = (event?.clientY ?? 0) - mouseDownClient.value.y;
  if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
  const dateYmd = addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dayName));
  const current = {
    key: actionSlotKey({ dateYmd, hour, roomId: 0 }),
    dateYmd,
    dayName: String(dayName),
    hour: Number(hour),
    roomId: 0,
    slot: null
  };
  if (current.key === dragAnchorSlot.value.key) return;
  if (!isCellDragSelecting.value) {
    isCellDragSelecting.value = true;
    selectedActionSlots.value = [dragAnchorSlot.value];
    lastSelectedActionKey.value = dragAnchorSlot.value.key;
  }
  selectedActionSlots.value = [dragAnchorSlot.value];
  lastSelectedActionKey.value = dragAnchorSlot.value.key;
  applyShiftSelection(current);
  suppressClickAfterDrag.value = true;
};

// ---- Office assignment modal (admin) ----
const showOfficeAssignModal = ref(false);
const officeAssignLoading = ref(false);
const officeAssignError = ref('');
const officeAssignDay = ref('Monday');
const officeAssignStartHour = ref(7);
const officeAssignEndHour = ref(8);
const officeAssignBuildingId = ref(0);
const officeAssignRoomId = ref(0);
const officeLocations = ref([]);
const officeRooms = ref([]);

// ---- Admin assign form (inline within request modal) ----
const ADMIN_ASSIGN_WEEKDAYS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];
const adminAssignMode = ref('provider'); // 'provider' | 'company_hold'
const adminAssignHoldTitle = ref('Company hold');
const adminAssignPersonSearch = ref('');
const adminAssignPersonId = ref(0);
const adminAssignPersonName = ref('');
const adminAssignShowDropdown = ref(false);
const adminAssignRecurrence = ref('ONCE');
const adminAssignWeekdays = ref([]);
const adminAssignRecurringUntil = ref('');
const adminAssignTemporary4Weeks = ref(false);
const adminAssignLoading = ref(false);
const adminAssignError = ref('');
const adminAssignProviders = ref([]);
const adminAssignProvidersLoading = ref(false);

// ---- Cancel booking action state ----
const cancelBookingScope = ref('occurrence'); // 'occurrence' | 'future'
const cancelBookingLoading = ref(false);
const cancelBookingError = ref('');

// ---- Provider office overlay (selected office location weekly grid) ----
/** 0 = Off (hide office blocks), -1 = All offices for this person, >0 = specific building */
const OFFICE_SCOPE_OFF = 0;
const OFFICE_SCOPE_ALL = -1;
const selectedOfficeLocationId = ref(OFFICE_SCOPE_ALL);
const isOfficeScopeSpecific = computed(() => Number(selectedOfficeLocationId.value) > 0);
const isOfficeScopeAll = computed(() => Number(selectedOfficeLocationId.value) === OFFICE_SCOPE_ALL);
const officeGridLoading = ref(false);
const officeGridError = ref('');
const officeGrid = ref(null); // { location, weekStart, days, hours, rooms, slots }

const officeBuildingShortName = (buildingId) => {
  const id = Number(buildingId || 0);
  if (!id) return 'Office';
  const row = (officeLocations.value || []).find((o) => Number(o?.id || 0) === id);
  const name = String(row?.name || '').trim();
  if (!name) return `B${id}`;
  return name.length > 10 ? `${name.slice(0, 10)}…` : name;
};

const resolveSpecificOfficeId = () => {
  const cur = Number(selectedOfficeLocationId.value || 0);
  if (cur > 0) return cur;
  const first = Number((officeLocations.value || [])[0]?.id || 0);
  return first > 0 ? first : 0;
};

/** IANA timezone for the selected (or first) office — schedule wall clock source of truth. */
const bookingTimezoneIana = computed(() => {
  const offices = officeLocations.value || [];
  const selectedId = Number(selectedOfficeLocationId.value || modalContext.value?.officeLocationId || 0);
  const selected = selectedId > 0
    ? offices.find((o) => Number(o?.id || 0) === selectedId)
    : null;
  const fromOffice = String(selected?.timezone || offices[0]?.timezone || '').trim();
  const fromGrid = String(officeGrid.value?.location?.timezone || '').trim();
  return fromOffice || fromGrid || 'America/Denver';
});
const bookingTimezoneLabel = computed(() => timezoneLabelFor(bookingTimezoneIana.value));

const isScheduleSuperAdmin = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return role === 'super_admin' || role === 'superadmin';
});

const actionAgencyOptions = computed(() => {
  const t = String(requestType.value || '');
  // Session booking: full tenant list (calendar “shown” chips must not lock the tenant picker).
  if (SESSION_BOOKING_ACTIONS.has(t)) {
    return bookingAgencyOptions.value.slice();
  }

  const active = new Set((activeScheduleAgencyIds.value || []).map((n) => Number(n || 0)).filter((n) => n > 0));
  let rows = agencyFilterOptions.value.filter((row) => active.has(Number(row.id)));
  if (!rows.length) rows = agencyFilterOptions.value.slice();

  // Office-locked actions: only tenants affiliated with this building.
  if (OFFICE_AGENCY_SCOPED_ACTIONS.has(t)) {
    const officeId = Number(modalContext.value?.officeLocationId || selectedOfficeLocationId.value || 0);
    if (officeId > 0) {
      const office = (officeLocations.value || []).find((o) => Number(o?.id || 0) === officeId);
      const affiliated = Array.isArray(office?.agencyIds)
        ? office.agencyIds.map((n) => Number(n || 0)).filter((n) => n > 0)
        : [];
      if (affiliated.length) {
        const allowed = new Set(affiliated);
        if (isScheduleSuperAdmin.value) {
          return affiliated.map((id) => {
            const existing = (bookingAgencyOptions.value || []).find((row) => Number(row.id) === id)
              || rows.find((row) => Number(row.id) === id)
              || agencyFilterOptions.value.find((row) => Number(row.id) === id);
            return {
              id,
              label: existing?.label || agencyLabel(id) || `Agency ${id}`,
              hasClinicalOrg: existing?.hasClinicalOrg ?? null,
              hasLearningOrg: existing?.hasLearningOrg ?? null,
              medicalBillingEnabled: !!existing?.medicalBillingEnabled
            };
          });
        }
        const filtered = rows.filter((row) => allowed.has(Number(row.id)));
        if (filtered.length) return filtered;
      }
    }
  }
  return rows;
});

const showActionAgencyPicker = computed(() => {
  if (!actionAgencyOptions.value.length && !headerTenantOptions.value.length) return false;
  if (SESSION_BOOKING_ACTIONS.has(String(requestType.value || ''))) return true;
  return actionRequiresAgency.value;
});

const canChangeActionAgency = computed(() => {
  if (SESSION_BOOKING_ACTIONS.has(String(requestType.value || ''))) {
    return headerTenantOptions.value.length > 1;
  }
  return actionAgencyOptions.value.length > 1;
});

const showInitialBookingContext = computed(() => {
  if (!showRequestModal.value) return false;
  const t = String(requestType.value || '').trim();
  return !t || t === 'slot_details';
});

const actionAgencyFilteredToOffice = computed(() => {
  const t = String(requestType.value || '');
  if (!OFFICE_AGENCY_SCOPED_ACTIONS.has(t)) return false;
  if (SESSION_BOOKING_ACTIONS.has(t)) return false;
  const officeId = Number(modalContext.value?.officeLocationId || selectedOfficeLocationId.value || 0);
  if (!officeId) return false;
  const office = (officeLocations.value || []).find((o) => Number(o?.id || 0) === officeId);
  return Array.isArray(office?.agencyIds) && office.agencyIds.length > 0;
});

// Keep selected agency inside the (possibly office-filtered) option list.
watch(actionAgencyOptions, (opts) => {
  const ids = (opts || []).map((row) => Number(row?.id || 0)).filter((n) => n > 0);
  if (!ids.length) return;
  if (!ids.includes(Number(selectedActionAgencyId.value || 0))) {
    selectedActionAgencyId.value = ids[0];
  }
});

const officePalette = [
  '#2563eb', // blue
  '#16a34a', // green
  '#dc2626', // red
  '#9333ea', // purple
  '#ea580c', // orange
  '#0f766e', // teal
  '#4f46e5', // indigo
  '#b45309' // amber
];

const officeColorById = (id) => {
  const n = Number(id || 0);
  if (!Number.isFinite(n) || n <= 0) return '#64748b';
  return officePalette[n % officePalette.length];
};

const agencyBadgePalette = [
  '#1d4ed8', // blue
  '#047857', // emerald
  '#b91c1c', // red
  '#7c3aed', // violet
  '#c2410c', // orange
  '#0f766e', // teal
  '#a16207', // amber
  '#be185d' // pink
];

const agencyBadgeColorById = (agencyId) => {
  const n = Number(agencyId || 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  return agencyBadgePalette[n % agencyBadgePalette.length];
};

/** Reactive map of tenant main icon URLs for schedule blocks and legend. */
const scheduleAgencyIconUrls = computed(() => {
  const ids = new Set();
  for (const id of activeScheduleAgencyIdSet.value || []) ids.add(Number(id));
  for (const row of selfScheduleAgencyOptions.value || []) {
    const id = Number(row?.id || 0);
    if (id > 0) ids.add(id);
  }
  for (const row of agencyFilterOptions.value || []) {
    const id = Number(row?.id || 0);
    if (id > 0) ids.add(id);
  }
  // Re-render when hydrated agencies or lazy icon paths arrive.
  void agencyStore.currentAgency;
  void agencyStore.userAgencies;
  void agencyStore.agencies;
  void brandingStore.iconFilePathCache;

  const out = {};
  for (const id of ids) {
    if (!Number.isFinite(id) || id <= 0) continue;
    const url = brandingStore.getOrganizationChromeIconUrl(id);
    if (url) out[id] = url;
  }
  return out;
});

const agencyIconUrlById = (agencyId) => {
  const id = Number(agencyId || 0);
  if (!Number.isFinite(id) || id <= 0) return null;
  return scheduleAgencyIconUrls.value[id] || brandingStore.getOrganizationChromeIconUrl(id) || null;
};

const officeOverlayStyle = computed(() => {
  const id = Number(selectedOfficeLocationId.value || 0);
  return { '--officeOverlayColor': officeColorById(id) };
});

const quickGlanceDateYmd = ref('');
const quickGlanceHour = ref(0);
const quickGlanceStateFilter = ref('all'); // all|booked|assigned|open

const quickGlanceDayOptions = computed(() => {
  const days = Array.isArray(officeGrid.value?.days) ? officeGrid.value.days : [];
  return days.map((d) => ({
    value: String(d).slice(0, 10),
    label: `${dayNameForDateYmd(d) || ''} ${String(d || '').slice(5, 10)}`
  }));
});

const quickGlanceHourOptions = computed(() => {
  const hours = Array.isArray(officeGrid.value?.hours) ? officeGrid.value.hours : [];
  return hours.map((h) => Number(h)).filter((h) => Number.isFinite(h));
});

const quickGlanceRows = computed(() => {
  const g = officeGrid.value;
  const date = String(quickGlanceDateYmd.value || '').slice(0, 10);
  const hour = Number(quickGlanceHour.value || 0);
  const currentUserId = Number(authStore.user?.id || 0);
  if (!g || !date || !Number.isFinite(hour)) return [];
  const rooms = Array.isArray(g.rooms) ? g.rooms : [];
  const slots = Array.isArray(g.slots) ? g.slots : [];
  const byRoom = new Map();
  for (const s of slots) {
    if (String(s?.date || '').slice(0, 10) !== date) continue;
    if (Number(s?.hour || -1) !== hour) continue;
    byRoom.set(Number(s.roomId), s);
  }
  const out = rooms.map((r) => {
    const slot = byRoom.get(Number(r.id)) || null;
    const st = String(slot?.state || 'open');
    const pending = Number(slot?.pendingRequestCount || 0) || 0;
    let statusLabel =
      st === 'assigned_booked' ? 'Booked'
        : st === 'assigned_available' ? 'Assigned'
          : st === 'assigned_temporary' ? 'Temporary hold'
            : st === 'company_hold' ? 'Company hold'
              : 'Open';
    if (pending > 0) statusLabel = statusLabel === 'Open' ? 'Requested (pending)' : `Requested (${statusLabel})`;
    const providerLabel = String(slot?.bookedProviderName || slot?.assignedProviderName || slot?.providerInitials || '').trim() || '—';
    const roomLabel = `${r?.roomNumber ? `#${r.roomNumber} ` : ''}${r?.label || r?.name || `Room ${r?.id || ''}`}`.trim();
    const bookedByMe = st === 'assigned_booked' && currentUserId > 0 && Number(slot?.bookedProviderId || 0) === currentUserId;
    // Non-admin without office management rights clicking someone else's booked slot → view-only info panel.
    const isViewOnlySlot = st === 'assigned_booked' && !bookedByMe && !isAdminMode.value && !canManageOffices.value;
    return {
      roomId: Number(r.id),
      roomLabel,
      state: st,
      statusLabel,
      providerLabel,
      hasPendingRequest: pending > 0,
      slot,
      isClickable: true,
      isViewOnlySlot
    };
  });
  const filter = String(quickGlanceStateFilter.value || 'all');
  const filtered = out.filter((row) => {
    if (filter === 'booked') return row.state === 'assigned_booked';
    if (filter === 'assigned') return row.state === 'assigned_available' || row.state === 'assigned_temporary';
    if (filter === 'open') return row.state === 'open';
    if (filter === 'requested') return row.hasPendingRequest;
    return true;
  });
  filtered.sort((a, b) => String(a.roomLabel).localeCompare(String(b.roomLabel)));
  return filtered;
});

const onQuickGlanceRowClick = (row) => {
  // Non-admin viewing someone else's booked slot → read-only info panel.
  if (row?.isViewOnlySlot) {
    slotInfoModalData.value = {
      roomLabel: row.roomLabel,
      providerLabel: row.providerLabel,
      state: row.state,
      statusLabel: row.statusLabel,
      slot: row.slot,
    };
    showSlotInfoModal.value = true;
    return;
  }
  const dateYmd = String(quickGlanceDateYmd.value || '').slice(0, 10);
  const hour = Number(quickGlanceHour.value || 0);
  const dayName = dayNameForDateYmd(dateYmd);
  if (!dateYmd || !Number.isFinite(hour) || !dayName) return;
  const st = String(row?.state || 'open').toUpperCase();
  const isOfficeOccupied = ['ASSIGNED_BOOKED', 'ASSIGNED_AVAILABLE', 'ASSIGNED_TEMPORARY', 'COMPANY_HOLD'].includes(st);
  openSlotActionModal({
    dayName,
    hour,
    roomId: Number(row?.roomId || 0),
    slot: row?.slot || null,
    dateYmd,
    preserveSelectionRange: false,
    initialRequestType: '',
    actionSource: isOfficeOccupied ? 'office_block' : 'plus_or_blank'
  });
};

const loadSelectedOfficeGrid = async () => {
  const id = Number(selectedOfficeLocationId.value || 0);
  // Only a concrete building loads a room grid (All / Off do not).
  if (!(id > 0)) {
    officeGrid.value = null;
    officeGridError.value = '';
    officeGridLoading.value = false;
    return;
  }
  const hadGrid = !!officeGrid.value;
  try {
    if (!hadGrid) officeGridLoading.value = true;
    officeGridError.value = '';
    const r = await api.get(`/office-schedule/locations/${id}/weekly-grid`, {
      params: { weekStart: weekStart.value },
      skipGlobalLoading: true
    });
    officeGrid.value = r.data || null;
  } catch (e) {
    if (!hadGrid) officeGrid.value = null;
    officeGridError.value = e.response?.data?.error?.message || 'Failed to load office availability';
  } finally {
    officeGridLoading.value = false;
  }
};

watch([selectedOfficeLocationId, weekStart], () => {
  void loadSelectedOfficeGrid();
});

watch([officeGrid, quickGlanceDayOptions, quickGlanceHourOptions], () => {
  const dayValues = quickGlanceDayOptions.value.map((x) => x.value);
  const hourValues = quickGlanceHourOptions.value;
  if (!dayValues.length || !hourValues.length) {
    quickGlanceDateYmd.value = '';
    quickGlanceHour.value = 0;
    return;
  }
  if (!dayValues.includes(String(quickGlanceDateYmd.value || ''))) {
    quickGlanceDateYmd.value = dayValues[0];
  }
  if (!hourValues.includes(Number(quickGlanceHour.value || 0))) {
    quickGlanceHour.value = Number(hourValues[0]);
  }
}, { immediate: true });

const officeOverlayKey = (dateYmd, hour) => `${String(dateYmd).slice(0, 10)}|${Number(hour)}`;

const officeOverlayStats = computed(() => {
  const g = officeGrid.value;
  if (!g || !Array.isArray(g.slots) || !Array.isArray(g.rooms)) return new Map();
  const roomCount = (g.rooms || []).length;
  const m = new Map();
  for (const s of g.slots || []) {
    const k = officeOverlayKey(s.date, s.hour);
    if (!m.has(k)) {
      m.set(k, { open: 0, assigned_available: 0, assigned_temporary: 0, assigned_booked: 0, totalRooms: roomCount });
    }
    const rec = m.get(k);
    const st = String(s.state || '');
    if (st === 'open') rec.open += 1;
    else if (st === 'assigned_available') rec.assigned_available += 1;
    else if (st === 'assigned_temporary') rec.assigned_temporary += 1;
    else if (st === 'assigned_booked') rec.assigned_booked += 1;
  }
  return m;
});

const officeOverlay = (dayName, hour) => {
  if (!isOfficeScopeSpecific.value) return '';
  if (ALL_DAYS.indexOf(String(dayName)) < 0) return '';
  const date = addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dayName));
  const rec = officeOverlayStats.value.get(officeOverlayKey(date, hour));
  if (!rec) return '';
  if (rec.open > 0) return `${rec.open} open rooms`;
  if (rec.assigned_available > 0) return `${rec.assigned_available} assigned`;
  if (rec.assigned_temporary > 0) return `${rec.assigned_temporary} temp`;
  if (rec.assigned_booked > 0) return 'Booked rooms';
  return '';
};

const officeOverlayTitle = (dayName, hour) => {
  if (ALL_DAYS.indexOf(String(dayName)) < 0) return '';
  const date = addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dayName));
  const rec = officeOverlayStats.value.get(officeOverlayKey(date, hour));
  if (!rec) return '';
  return [
    `Office availability — ${dayName} ${hourLabel(hour)}`,
    `Open: ${rec.open}`,
    `Assigned available: ${rec.assigned_available}`,
    `Assigned temporary: ${rec.assigned_temporary}`,
    `Assigned booked: ${rec.assigned_booked}`
  ].join('\n');
};

const hexToRgba = (hex, alpha = 0.28) => {
  const raw = String(hex || '').replace('#', '').trim();
  if (raw.length !== 6) return null;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  if (![r, g, b].every((n) => Number.isFinite(n))) return null;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** Tint tenant/event colors toward white so blocks stay readable on dark grid backgrounds. */
const lightenHex = (hex, amount = 0.42) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const mix = Math.max(0, Math.min(1, Number(amount)));
  const r = Math.round(rgb.r + (255 - rgb.r) * mix);
  const g = Math.round(rgb.g + (255 - rgb.g) * mix);
  const b = Math.round(rgb.b + (255 - rgb.b) * mix);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

const typeStyleToken = (b) => {
  const kind = String(b?.kind || '');
  if (kind === 'ob') return 'Booked';
  if (kind === 'oa') return 'Assigned';
  if (kind === 'ot') return 'Temp';
  if (kind === 'supv') return 'Supv';
  if (kind === 'school') return 'School';
  if (kind === 'request') return 'Req';
  if (kind === 'intake-ip') return 'IP';
  if (kind === 'intake-vi') return 'VI';
  if (kind === 'sevt') {
    const eventKind = String(b?.eventKind || '').toUpperCase();
    if (eventKind === 'TEAM_MEETING') return 'Meeting';
    if (eventKind === 'HUDDLE') return 'Huddle';
    if (eventKind === 'SCHEDULE_HOLD') return 'Hold';
    if (eventKind === 'INDIRECT_SERVICES') return 'Indirect';
    const title = String(b?.title || b?.shortLabel || '').toLowerCase();
    if (title.includes('virtual') || title.includes('session')) return 'Session';
    return 'Event';
  }
  return '';
};

const cellBlockStyle = (b) => {
  const kind = String(b?.kind || '');
  const style = {};
  const dark = darkScheduleTheme.value;
  const officeKindFillMap = dark
    ? {
      oa: { fill: 'rgba(147, 197, 253, 0.52)', border: 'rgba(147, 197, 253, 0.88)' },
      ot: { fill: 'rgba(253, 186, 116, 0.52)', border: 'rgba(251, 146, 60, 0.88)' },
      ob: { fill: 'rgba(252, 165, 165, 0.52)', border: 'rgba(248, 113, 113, 0.88)' }
    }
    : {
      oa: { fill: 'rgba(59, 130, 246, 0.24)', border: 'rgba(37, 99, 235, 0.60)' },
      ot: { fill: 'rgba(249, 115, 22, 0.24)', border: 'rgba(194, 65, 12, 0.62)' },
      ob: { fill: 'rgba(239, 68, 68, 0.24)', border: 'rgba(185, 28, 28, 0.62)' }
    };
  if (officeKindFillMap[kind]) {
    style['--blockFill'] = officeKindFillMap[kind].fill;
    style['--blockBorder'] = officeKindFillMap[kind].border;
  }
  if (kind === 'sevt') {
    const eventKind = String(b?.eventKind || '').toUpperCase();
    if (eventKind === 'TEAM_MEETING') {
      style['--blockFill'] = dark ? 'rgba(216, 180, 254, 0.48)' : 'rgba(147, 51, 234, 0.22)';
      style['--blockBorder'] = dark ? 'rgba(196, 181, 253, 0.85)' : 'rgba(126, 34, 206, 0.52)';
    } else if (eventKind === 'HUDDLE') {
      style['--blockFill'] = dark ? 'rgba(103, 232, 249, 0.42)' : 'rgba(6, 182, 212, 0.22)';
      style['--blockBorder'] = dark ? 'rgba(34, 211, 238, 0.82)' : 'rgba(14, 116, 144, 0.50)';
    }
  }
  if (kind === 'peerbusy') {
    const peerColor = peerColorById(b?.peerUserId);
    const fillColor = dark ? lightenHex(peerColor, 0.38) : peerColor;
    const borderColor = dark ? lightenHex(peerColor, 0.18) : peerColor;
    const fill = hexToRgba(fillColor, dark ? 0.52 : 0.22);
    const border = hexToRgba(borderColor, dark ? 0.88 : 0.70);
    if (fill) style['--blockFill'] = fill;
    if (border) style['--blockBorder'] = border;
    style['--peerAccent'] = peerColor;
  }
  // Multi-tenant view: fill by organization; appointment type stays in the label/stripe.
  if (colorBlocksByTenant.value && kind !== 'peerbusy') {
    const tenantColor = agencyBadgeColorById(b?.agencyId);
    const fillColor = dark ? lightenHex(tenantColor, 0.45) : tenantColor;
    const borderColor = dark ? lightenHex(tenantColor, 0.22) : tenantColor;
    const fill = hexToRgba(fillColor, dark ? 0.56 : 0.30);
    const border = hexToRgba(borderColor, dark ? 0.88 : 0.72);
    if (fill) style['--blockFill'] = fill;
    if (border) style['--blockBorder'] = border;
    style['--blockTypeStripe'] = officeKindFillMap[kind]?.border
      || (kind === 'supv' ? (dark ? 'rgba(216, 180, 254, 0.92)' : 'rgba(147, 51, 234, 0.85)')
        : kind === 'school' ? (dark ? 'rgba(147, 197, 253, 0.92)' : 'rgba(37, 99, 235, 0.85)')
          : kind === 'sevt' ? (dark ? 'rgba(110, 231, 183, 0.92)' : 'rgba(15, 118, 110, 0.85)')
            : (dark ? 'rgba(203, 213, 225, 0.85)' : 'rgba(100, 116, 139, 0.75)'));
  }
  return style;
};

const hasAgencyBadge = (block) => Number(block?.agencyId || 0) > 0;

const agencyBadgeStyle = (block) => {
  const color = agencyBadgeColorById(block?.agencyId);
  if (!color) return {};
  return { '--agencyDot': color };
};

const agencyBadgeTitle = (block) => {
  const id = Number(block?.agencyId || 0);
  if (!id) return '';
  return `Agency: ${agencyLabel(id) || `Agency ${id}`}`;
};

const officeAssignStartHourOptions = computed(() => {
  const min = Number(gridMinHour.value || 7);
  const max = Math.max(Number(gridMaxHour.value || 22) - 1, min);
  const out = [];
  for (let h = min; h <= max; h += 1) out.push(h);
  return out;
});

const officeAssignEndHourOptions = computed(() => {
  const start = Number(officeAssignStartHour.value || 0);
  const maxEnd = Math.max(Number(gridMaxHour.value || 22), start + 1);
  const out = [];
  for (let h = start + 1; h <= maxEnd; h += 1) out.push(h);
  return out;
});

const syncOfficeAssignTimesToModal = () => {
  const start = Number(officeAssignStartHour.value || 0);
  let end = Number(officeAssignEndHour.value || 0);
  if (!Number.isFinite(start)) return;
  if (!Number.isFinite(end) || end <= start) {
    end = Math.min(start + 1, Number(gridMaxHour.value || 22));
    officeAssignEndHour.value = end;
  }
  modalHour.value = start;
  modalStartHour.value = start;
  modalEndHour.value = end;
};

const onOfficeAssignStartHourChange = () => {
  const start = Number(officeAssignStartHour.value || 0);
  if (Number(officeAssignEndHour.value || 0) <= start) {
    officeAssignEndHour.value = Math.min(start + 1, Number(gridMaxHour.value || 22));
  }
  syncOfficeAssignTimesToModal();
};

const adminAssignPersonResults = computed(() => {
  const list = adminAssignProviders.value || [];
  const q = (adminAssignPersonSearch.value || '').trim().toLowerCase();
  if (!q) return list.slice(0, 30);
  return list.filter((p) =>
    `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase().includes(q) ||
    `${p.last_name || ''}, ${p.first_name || ''}`.toLowerCase().includes(q) ||
    `${p.last_name || ''} ${p.first_name || ''}`.toLowerCase().includes(q)
  ).slice(0, 30);
});

const adminAssignCanSubmit = computed(() =>
  !adminAssignLoading.value && (
    adminAssignMode.value === 'company_hold' ||
    adminAssignPersonId.value > 0
  )
);

const adminAssignRoomLabel = computed(() => {
  const roomId = Number(modalContext.value?.roomId || 0);
  if (!roomId) return '';
  const rooms = Array.isArray(officeGrid.value?.rooms) ? officeGrid.value.rooms : [];
  const room = rooms.find((r) => Number(r.id) === roomId);
  if (!room) return `Room ${roomId}`;
  const num = room.roomNumber || room.room_number;
  return [num ? `#${num}` : null, room.label || room.name].filter(Boolean).join(' ') || `Room ${roomId}`;
});

const loadOfficeLocations = async () => {
  try {
    const r = await api.get('/offices');
    const rows = Array.isArray(r.data) ? r.data : [];
    officeLocations.value = rows.map((row) => ({
      ...row,
      agencyIds: Array.isArray(row?.agencyIds)
        ? row.agencyIds.map((n) => Number(n || 0)).filter((n) => n > 0)
        : []
    }));

    // Default to user's assigned office when none selected (most have just 1)
    if (Number(selectedOfficeLocationId.value || 0) === 0 && props.mode === 'self' && rows.length > 0) {
      try {
        const agencyId = Number(effectiveAgencyId.value || 0);
        const params = agencyId > 0 ? { agencyId } : {};
        const assigned = await api.get('/payroll/me/assigned-offices', { params });
        const list = Array.isArray(assigned?.data) ? assigned.data : [];
        const officeIds = new Set(rows.map((o) => Number(o.id)));
        const first = list.find((o) => officeIds.has(Number(o.id)));
        if (first) {
          selectedOfficeLocationId.value = Number(first.id);
        } else if (rows.length === 1) {
          selectedOfficeLocationId.value = Number(rows[0].id);
        }
      } catch {
        if (rows.length === 1) selectedOfficeLocationId.value = Number(rows[0].id);
      }
    }
  } catch {
    officeLocations.value = [];
  }
};

/** Ensure office→agency affiliations are loaded (for tenant filtering in the booking modal). */
const ensureOfficeAgencyIds = async (officeLocationId) => {
  const id = Number(officeLocationId || 0);
  if (!id) return;
  const idx = (officeLocations.value || []).findIndex((o) => Number(o?.id || 0) === id);
  if (idx < 0) return;
  const existing = officeLocations.value[idx]?.agencyIds;
  if (Array.isArray(existing) && existing.length) return;
  try {
    const r = await api.get(`/offices/${id}`, { skipGlobalLoading: true });
    const agencies = Array.isArray(r.data?.agencies) ? r.data.agencies : [];
    const agencyIds = agencies
      .map((a) => Number(a?.id || a?.agency_id || 0))
      .filter((n) => n > 0);
    officeLocations.value[idx] = { ...officeLocations.value[idx], agencyIds };
  } catch {
    /* keep existing row */
  }
};

// Must run after `loadOfficeLocations` + `officeLocations` are declared (avoids TDZ ReferenceError).
watch(
  () => authStore.user?.id,
  () => {
    void loadMyScheduleColors();
    if (!officeLocations.value.length) void loadOfficeLocations();
  },
  { immediate: true }
);

const loadOfficeRooms = async (buildingId) => {
  const id = Number(buildingId || 0);
  if (!id) {
    officeRooms.value = [];
    return;
  }
  try {
    const r = await api.get(`/office-schedule/locations/${id}/rooms`);
    const rows = Array.isArray(r.data) ? r.data : [];
    // sort by room number if present
    const numVal = (x) => {
      const n = x?.roomNumber ?? x?.room_number ?? null;
      const parsed = parseInt(n, 10);
      return Number.isFinite(parsed) ? parsed : null;
    };
    rows.sort((a, b) => {
      const an = numVal(a);
      const bn = numVal(b);
      if (an !== null && bn !== null && an !== bn) return an - bn;
      if (an !== null && bn === null) return -1;
      if (an === null && bn !== null) return 1;
      return String(a?.label || a?.name || '').localeCompare(String(b?.label || b?.name || ''));
    });
    officeRooms.value = rows;
  } catch {
    officeRooms.value = [];
  }
};

watch(officeAssignBuildingId, async (id) => {
  officeAssignRoomId.value = 0;
  await loadOfficeRooms(id);
});

const submitCancelBooking = async () => {
  const contexts = selectedActionContexts().filter(
    (x) => Number(x?.officeLocationId || 0) > 0
      && (Number(x?.officeEventId || 0) > 0 || Number(x?.standingAssignmentId || 0) > 0)
  );
  cancelBookingError.value = '';
  if (!contexts.length) {
    cancelBookingError.value = 'No booking data found for this slot.';
    return;
  }
  try {
    cancelBookingLoading.value = true;
    const scope = cancelBookingScope.value || 'occurrence';
    const seenEvents = new Set();
    const seenStandings = new Set();
    for (const ctx of contexts) {
      const locId = Number(ctx.officeLocationId || selectedOfficeLocationId.value || 0);
      if (!locId) continue;
      const eventId = Number(ctx.officeEventId || 0);
      if (eventId > 0 && !seenEvents.has(eventId)) {
        seenEvents.add(eventId);
        // eslint-disable-next-line no-await-in-loop
        await api.post(`/office-slots/${locId}/events/${eventId}/cancel`, { scope });
      }
      const standingId = Number(ctx.standingAssignmentId || 0);
      if (scope === 'future' && standingId > 0 && !seenStandings.has(standingId)) {
        seenStandings.add(standingId);
        // eslint-disable-next-line no-await-in-loop
        await api.post(`/office-slots/${locId}/assignments/${standingId}/cancel`, {
          scope: 'future',
          date: String(ctx.dateYmd || '').slice(0, 10),
          hour: Number(ctx.hour || 0)
        });
      }
    }
    invalidateScheduleSummaryCacheForUser(props.userId);
    closeModal();
    await Promise.all([load({ forceRefresh: true }), loadSelectedOfficeGrid()]);
  } catch (e) {
    cancelBookingError.value = e.response?.data?.error?.message || e.message || 'Failed to cancel booking.';
  } finally {
    cancelBookingLoading.value = false;
  }
};

const loadAdminAssignProviders = async () => {
  const locId = Number(selectedOfficeLocationId.value || 0) || Number(modalContext.value?.officeLocationId || 0);
  if (!locId || !canManageOffices.value) { adminAssignProviders.value = []; return; }
  adminAssignProvidersLoading.value = true;
  try {
    const r = await api.get(`/office-schedule/locations/${locId}/providers`);
    adminAssignProviders.value = Array.isArray(r.data) ? r.data : [];
  } catch {
    adminAssignProviders.value = [];
  } finally {
    adminAssignProvidersLoading.value = false;
  }
};

const selectAdminAssignPerson = (p) => {
  adminAssignPersonId.value = Number(p.id);
  adminAssignPersonName.value = `${p.last_name || ''}, ${p.first_name || ''}`.trim();
  adminAssignPersonSearch.value = adminAssignPersonName.value;
  adminAssignShowDropdown.value = false;
};

const onAdminAssignPersonBlur = () => {
  window.setTimeout(() => { adminAssignShowDropdown.value = false; }, 180);
};

const submitAdminAssign = async () => {
  try {
    adminAssignLoading.value = true;
    adminAssignError.value = '';
    const locId = Number(selectedOfficeLocationId.value || 0) || Number(modalContext.value?.officeLocationId || 0);
    if (!locId) throw new Error('No office location selected. Switch to office layout and select an office first.');
    const slots = sortedSelectedActionSlots();
    const firstSlot = slots[0] || {};
    const dateYmd = String(firstSlot.dateYmd || modalContext.value?.dateYmd || '').slice(0, 10);
    const startHour = Number(officeAssignStartHour.value ?? firstSlot.hour ?? modalContext.value?.hour ?? 0);
    const endHour = Number(officeAssignEndHour.value || 0);
    const roomId = Number(firstSlot.roomId || modalContext.value?.roomId || 0);
    if (!roomId) throw new Error('No room selected. Click on a specific room cell in the office layout grid.');
    if (!dateYmd || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) throw new Error('Invalid date. Please try clicking the slot again.');
    if (!(endHour > startHour)) throw new Error('End time must be after start time.');
    if (adminAssignMode.value === 'provider' && !adminAssignPersonId.value) throw new Error('Please select a person to assign.');
    const body = {
      roomId,
      date: dateYmd,
      hour: startHour,
      endHour,
      recurrenceFrequency: adminAssignRecurrence.value,
      assignmentMode: adminAssignMode.value === 'company_hold' ? 'COMPANY_HOLD' : 'PROVIDER',
    };
    if (adminAssignMode.value === 'company_hold') {
      body.holdTitle = adminAssignHoldTitle.value || 'Company hold';
    } else {
      body.assignedUserId = adminAssignPersonId.value;
    }
    if (adminAssignRecurrence.value !== 'ONCE') {
      body.weekdays = adminAssignWeekdays.value;
      if (adminAssignRecurringUntil.value) body.recurringUntilDate = adminAssignRecurringUntil.value;
      if (adminAssignTemporary4Weeks.value) body.temporaryWeeks = 4;
    }
    await api.post(`/office-slots/${locId}/open-slots/assign`, body);
    invalidateScheduleSummaryCacheForUser(props.userId);
    closeModal();
    await Promise.all([load({ forceRefresh: true }), loadSelectedOfficeGrid()]);
  } catch (e) {
    adminAssignError.value = e.response?.data?.error?.message || e.message || 'Failed to assign slot';
  } finally {
    adminAssignLoading.value = false;
  }
};

watch(requestType, (newType) => {
  if (newType !== 'admin_assign') return;
  void loadAdminAssignProviders();
  // Pre-fill weekday from clicked day
  if (!adminAssignWeekdays.value.length && modalDay.value) {
    const idx = ALL_DAYS.indexOf(String(modalDay.value || ''));
    if (idx >= 0) adminAssignWeekdays.value = [(idx + 1) % 7];
  }
  // Default recurring until (~3 months)
  if (!adminAssignRecurringUntil.value) {
    adminAssignRecurringUntil.value = addDaysYmd(todayLocalYmd.value, 90);
  }
  // Sync end hour from the highlighted modal range (not a leftover 1-hour default).
  officeAssignStartHour.value = Number(modalHour.value || 0);
  const rangeEnd = Number(modalEndHour.value || 0);
  officeAssignEndHour.value = rangeEnd > officeAssignStartHour.value
    ? rangeEnd
    : Math.min(officeAssignStartHour.value + 1, 22);
  // Pre-fill person from already-booked/assigned slot
  const ctx = modalContext.value || {};
  const bookedId = Number(ctx.assignedProviderId || 0);
  if (bookedId && canManageOffices.value) {
    adminAssignPersonId.value = bookedId;
    adminAssignPersonName.value = String(ctx.bookedProviderName || ctx.assignedProviderName || '').trim();
    adminAssignPersonSearch.value = adminAssignPersonName.value;
  }
});

// After providers load, auto-fill name if ID was pre-filled (e.g. from props.userId)
watch(adminAssignProviders, (newList) => {
  if (adminAssignPersonId.value && !adminAssignPersonName.value) {
    const p = newList.find((x) => Number(x.id) === Number(adminAssignPersonId.value));
    if (p) {
      adminAssignPersonName.value = `${p.last_name || ''}, ${p.first_name || ''}`.trim();
      adminAssignPersonSearch.value = adminAssignPersonName.value;
    }
  }
});

const openOfficeAssignModal = async (dayName, hour) => {
  officeAssignError.value = '';
  officeAssignDay.value = String(dayName);
  officeAssignStartHour.value = Number(hour);
  officeAssignEndHour.value = Math.min(Number(hour) + 1, 22);
  showOfficeAssignModal.value = true;
  if (!officeLocations.value.length) await loadOfficeLocations();
};

const closeOfficeAssignModal = () => {
  showOfficeAssignModal.value = false;
  officeAssignError.value = '';
  officeAssignBuildingId.value = 0;
  officeAssignRoomId.value = 0;
  officeRooms.value = [];
};

const submitOfficeAssign = async () => {
  try {
    officeAssignLoading.value = true;
    officeAssignError.value = '';
    if (ALL_DAYS.indexOf(String(officeAssignDay.value)) < 0) throw new Error('Invalid day');
    const dateYmd = addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(officeAssignDay.value));
    await api.post(`/office-slots/${officeAssignBuildingId.value}/open-slots/assign`, {
      roomId: officeAssignRoomId.value,
      assignedUserId: Number(props.userId),
      date: dateYmd,
      hour: officeAssignStartHour.value,
      endHour: officeAssignEndHour.value
    });
    closeOfficeAssignModal();
    invalidateScheduleSummaryCacheForUser(props.userId);
    await Promise.all([
      load({ forceRefresh: true }),
      ...(Number(selectedOfficeLocationId.value || 0) > 0 ? [loadSelectedOfficeGrid()] : [])
    ]);
  } catch (e) {
    officeAssignError.value = e.response?.data?.error?.message || e.message || 'Failed to assign slot';
  } finally {
    officeAssignLoading.value = false;
  }
};

const onQuickActionSelect = (act) => {
  const id = String(act?.id || '');
  if (act?.disabledReason) return;
  if (id === 'indirect_services' && (isHourlyWorker.value || isAdminMode.value)) {
    // Payroll indirect time is logged via the dedicated Time Submission flow.
    recordSlotActionUsage(id);
    closeModal();
    const q = { ...route.query, tab: 'log_time' };
    router.push({ query: q }).catch(() => {});
    return;
  }
  recordSlotActionUsage(id);
  requestType.value = id;
  requestTypeChosenByUser.value = true;
  if (id === 'individual_session' && !String(bookingModality.value || '').trim()) {
    bookingModality.value = 'TELEHEALTH';
  }
};

const requestCloseModal = () => {
  if (requestModalIsDirty.value) {
    const ok = window.confirm('Discard this schedule entry? Your unsaved changes will be lost.');
    if (!ok) return;
  }
  closeModal();
};

const closeModal = () => {
  appointmentEditOpenGen += 1;
  showRequestModal.value = false;
  modalActionSource.value = 'general';
  requestType.value = '';
  scheduleEventEditId.value = 0;
  scheduleEventEditError.value = '';
  scheduleEventSaving.value = false;
  requestTypeChosenByUser.value = false;
  showAdditionalParticipantsPicker.value = false;
  sessionAlsoRequestOffice.value = false;
  linkPlatformVideoRoom.value = true;
  virtualSessionParticipantSearch.value = '';
  virtualSessionSelectedClientIds.value = [];
  virtualSessionSelectedGuardianKeys.value = [];
  virtualSessionIncludeGuardians.value = false;
  resetVirtualSessionShareState();
  requestNotes.value = '';
  scheduleEventTitle.value = '';
  scheduleEventAllDay.value = false;
  scheduleEventPrivate.value = false;
  scheduleEventRecurrence.value = 'ONCE';
  scheduleEventRecurrenceEndMode.value = 'count';
  scheduleEventOccurrenceCount.value = 6;
  supervisionRecurrence.value = 'ONCE';
  supervisionRecurrenceEndMode.value = 'count';
  supervisionOccurrenceCount.value = 6;
  modalStartMinute.value = 0;
  modalEndMinute.value = 0;
  modalStartHour.value = modalHour.value;
  scheduleHoldReasonCode.value = 'DOCUMENTATION';
  scheduleHoldCustomReason.value = '';
  modalError.value = '';
  intakeConfirmStep.value = null;
  intakeConfirmChoice.value = null;
  adminAssignMode.value = 'provider';
  adminAssignHoldTitle.value = 'Company hold';
  adminAssignPersonSearch.value = '';
  adminAssignPersonId.value = 0;
  adminAssignPersonName.value = '';
  adminAssignShowDropdown.value = false;
  adminAssignRecurrence.value = 'ONCE';
  adminAssignWeekdays.value = [];
  adminAssignRecurringUntil.value = '';
  adminAssignTemporary4Weeks.value = false;
  adminAssignError.value = '';
  cancelBookingScope.value = 'occurrence';
  cancelBookingError.value = '';
};

const confirmIntakeInPerson = (enableBoth) => {
  intakeConfirmChoice.value = enableBoth ? 'both' : 'ip_only';
  intakeConfirmStep.value = null;
  void submitRequest();
};

const confirmIntakeVirtual = () => {
  intakeConfirmChoice.value = 'vi_yes';
  intakeConfirmStep.value = null;
  void submitRequest();
};

const toProviderNoteAidPath = () => {
  const path = typeof window !== 'undefined' ? String(window.location?.pathname || '') : '';
  const m = path.match(/^\/([^/]+)\//);
  return m?.[1] ? `/${m[1]}/admin/note-aid` : '/admin/note-aid';
};

const openTherapyNoteAid = (item) => {
  if (!item?.therapyNoteAid) return;
  const q = new URLSearchParams();
  if (item.therapyStartAt) q.set('therapyStartAt', String(item.therapyStartAt));
  if (item.therapyEndAt) q.set('therapyEndAt', String(item.therapyEndAt));
  if (item.therapySummary) q.set('therapySummary', String(item.therapySummary));
  if (item.therapyCalendarLabel) q.set('therapyCalendarLabel', String(item.therapyCalendarLabel));
  q.set('therapySource', 'therapy_notes');
  window.location.href = `${toProviderNoteAidPath()}?${q.toString()}`;
};

const openNoteAidFromContext = (launchIntent = 'note') => {
  const ctx = modalContext.value || {};
  const officeEventId = Number(ctx.officeEventId || 0);
  if (!officeEventId) throw new Error('Booked office event context is required for Note Aid.');
  const officeId = Number(ctx.officeLocationId || 0) || null;
  const roomId = Number(ctx.roomId || 0) || null;
  const top = officeTopEvent(modalDay.value, modalHour.value, officeId, roomId) || null;
  const clientId = Number(top?.clientId || 0);
  if (!clientId) throw new Error('Booked slot needs a client before opening Note Aid.');
  const query = new URLSearchParams({
    officeEventId: String(officeEventId),
    clientId: String(clientId),
    launchIntent: String(launchIntent || 'note'),
    noteType: String(top?.appointmentType || 'PROGRESS_NOTE'),
    templateVersion: 'v1'
  });
  const serviceCode = String(top?.serviceCode || '').trim().toUpperCase();
  if (serviceCode) query.set('serviceCode', serviceCode);
  window.location.href = `${toProviderNoteAidPath()}?${query.toString()}`;
};

const minuteFromTime = (t) => {
  const m = String(t || '').match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

const ensureVirtualWorkingHoursForRange = async ({ dayName, startHour, endHour }) => {
  const agencyId = Number(effectiveAgencyId.value || 0);
  if (!agencyId) return;
  const day = String(dayName || '');
  const targetStart = `${pad2(startHour)}:00`;
  const targetEnd = `${pad2(endHour)}:00`;
  const resp = await api.get('/availability/me/virtual-working-hours', { params: { agencyId } });
  const rows = Array.isArray(resp?.data?.rows) ? resp.data.rows : [];
  const normalized = rows.map((r) => ({
    dayOfWeek: String(r.dayOfWeek || ''),
    startTime: String(r.startTime || ''),
    endTime: String(r.endTime || ''),
    sessionType: String(r.sessionType || 'REGULAR').toUpperCase(),
    frequency: String(r.frequency || 'WEEKLY').toUpperCase()
  })).filter((r) => r.dayOfWeek && r.startTime && r.endTime);

  const targetStartMin = minuteFromTime(targetStart);
  const targetEndMin = minuteFromTime(targetEnd);
  const sameDay = normalized.filter((r) => r.dayOfWeek === day);
  const overlaps = sameDay.filter((r) => {
    const s = minuteFromTime(r.startTime);
    const e = minuteFromTime(r.endTime);
    return s !== null && e !== null && !(e < targetStartMin || s > targetEndMin);
  });

  if (overlaps.some((r) => ['INTAKE', 'BOTH'].includes(r.sessionType))) return;

  const rowsWithoutOverlaps = normalized.filter((r) => !overlaps.includes(r));
  const allMins = [targetStartMin, targetEndMin];
  for (const r of overlaps) {
    const s = minuteFromTime(r.startTime);
    const e = minuteFromTime(r.endTime);
    if (s !== null) allMins.push(s);
    if (e !== null) allMins.push(e);
  }
  const mergedStart = Math.min(...allMins);
  const mergedEnd = Math.max(...allMins);
  const mergedRow = {
    dayOfWeek: day,
    startTime: `${pad2(Math.floor(mergedStart / 60))}:${pad2(mergedStart % 60)}`,
    endTime: `${pad2(Math.floor(mergedEnd / 60))}:${pad2(mergedEnd % 60)}`,
    sessionType: 'BOTH',
    frequency: overlaps[0]?.frequency || 'WEEKLY'
  };
  const nextRows = [...rowsWithoutOverlaps, mergedRow];
  await api.put('/availability/me/virtual-working-hours', { agencyId, rows: nextRows });
};

const selectedActionContexts = () => {
  const rows = sortedSelectedActionSlots().map((row) => (
    viewMode.value === 'office_layout' ? enrichOfficeSelectionItem(row) : row
  ));
  if (!rows.length) return [modalContext.value];
  return rows.map((x) => buildModalContext({
    dayName: x.dayName,
    hour: x.hour,
    roomId: x.roomId,
    slot: x.slot,
    dateYmd: x.dateYmd
  }));
};

const defaultScheduleEventTitleForAction = (actionId) => {
  if (actionId === 'agency_meeting') return 'Agency Meeting';
  if (actionId === 'huddle') return 'Huddle';
  if (actionId === 'schedule_hold' || actionId === 'schedule_hold_all_day') return 'Schedule Hold';
  if (actionId === 'indirect_services') return 'Indirect Services';
  return 'Personal Event';
};

const effectiveScheduleHoldReason = () => {
  if (String(scheduleHoldReasonCode.value || '').toUpperCase() !== 'CUSTOM') {
    return String(scheduleHoldReasonCode.value || '').toUpperCase() || null;
  }
  const custom = String(scheduleHoldCustomReason.value || '').trim();
  if (!custom) return 'CUSTOM';
  return custom.slice(0, 120).replace(/\s+/g, '_').toUpperCase();
};

const scheduleEventKindForAction = (actionId) => {
  if (actionId === 'agency_meeting') return 'TEAM_MEETING';
  if (actionId === 'huddle') return 'HUDDLE';
  if (actionId === 'indirect_services') return 'INDIRECT_SERVICES';
  if (actionId === 'schedule_hold' || actionId === 'schedule_hold_all_day') return 'SCHEDULE_HOLD';
  return 'PERSONAL_EVENT';
};

const mergeSelectedSlotsByDay = ({ dayName, startHour, endHour }) => {
  const selected = sortedSelectedActionSlots();
  const fallbackDate = addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dayName));
  const seedRows = selected.length
    ? selected.map((x) => ({ dateYmd: String(x.dateYmd || fallbackDate).slice(0, 10), hour: Number(x.hour) }))
    : [{ dateYmd: fallbackDate, hour: Number(startHour) }];
  const byDate = new Map();
  for (const row of seedRows) {
    if (!byDate.has(row.dateYmd)) byDate.set(row.dateYmd, []);
    byDate.get(row.dateYmd).push(Number(row.hour));
  }
  const ranges = [];
  for (const [dateYmd, list] of byDate.entries()) {
    const uniq = Array.from(new Set(list)).sort((a, b) => a - b);
    if (!uniq.length) continue;
    if (!selected.length) {
      ranges.push({ dateYmd, startHour: Number(startHour), endHour: Number(endHour) });
      continue;
    }
    let start = uniq[0];
    let prev = uniq[0];
    for (let i = 1; i < uniq.length; i += 1) {
      const cur = uniq[i];
      if (cur === prev + 1) {
        prev = cur;
        continue;
      }
      ranges.push({ dateYmd, startHour: start, endHour: prev + 1 });
      start = cur;
      prev = cur;
    }
    ranges.push({ dateYmd, startHour: start, endHour: prev + 1 });
  }
  return ranges;
};

const scheduleEventOccurrenceDates = (baseDateYmd, recurrence, occurrenceCount) => {
  const base = String(baseDateYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return [];
  const normalized = String(recurrence || 'ONCE').trim().toUpperCase();
  if (!['WEEKLY', 'BIWEEKLY', 'MONTHLY'].includes(normalized)) return [base];
  const count = Math.min(520, Math.max(1, Number(occurrenceCount || 1)));
  const dates = [];
  for (let i = 0; i < count; i += 1) {
    if (normalized === 'WEEKLY') {
      dates.push(addDaysYmd(base, i * 7));
    } else if (normalized === 'BIWEEKLY') {
      dates.push(addDaysYmd(base, i * 14));
    } else {
      dates.push(addMonthsYmd(base, i));
    }
  }
  return dates;
};

const recurringMeetingOccurrenceCount = (recurrence, endMode, occurrenceCount) => {
  const normalized = String(recurrence || 'ONCE').trim().toUpperCase();
  if (!['WEEKLY', 'BIWEEKLY', 'MONTHLY'].includes(normalized)) return 1;
  if (String(endMode || 'count') === 'indefinite') {
    if (normalized === 'WEEKLY') return 260; // ~5 years
    if (normalized === 'BIWEEKLY') return 130; // ~5 years
    return 60; // monthly ~5 years
  }
  return Math.min(104, Math.max(1, Number(occurrenceCount || 6) || 6));
};

const generateRecurrenceSeriesId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `series-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
};

const browserIanaTimeZone = () => {
  const tz = String(Intl.DateTimeFormat().resolvedOptions?.().timeZone || '').trim();
  return tz || null;
};

const buildVirtualAttendeeNotes = () => {
  const clientById = new Map((virtualSessionClients.value || []).map((c) => [Number(c.id), c]));
  const guardianByKey = new Map((virtualSessionGuardians.value || []).map((g) => [virtualSessionGuardianKey(g), g]));
  const lines = [];
  for (const id of virtualSessionSelectedClientIdSet.value.values()) {
    const row = clientById.get(id);
    lines.push(row?.displayName || `Client ${id}`);
  }
  for (const key of virtualSessionSelectedGuardianKeySet.value.values()) {
    const row = guardianByKey.get(key);
    lines.push(row?.displayName ? `${row.displayName} (guardian)` : 'Guardian');
  }
  if (!lines.length) return '';
  return `Attendees: ${lines.join(', ')}`;
};

const pushCounselingSessionRoute = async (sessionKey) => {
  const slug = String(
    route.params.organizationSlug ||
      agencyStore?.currentAgency?.slug ||
      agencyStore?.currentAgency?.portal_url ||
      ''
  ).trim();
  const path = slug
    ? `/${slug}/counseling/session/${sessionKey}`
    : `/counseling/session/${sessionKey}`;
  await router.push(path);
};

const completePlatformVirtualSessionBooking = async ({
  dayName,
  hour,
  startMinute,
  endHour,
  endMinute,
  alsoBookOffice,
  officeId
}) => {
  const uid = Number(scheduleActorUserId.value || props.userId || authStore.user?.id || 0);
  if (!uid) throw new Error('Provider is required.');
  const agencyId = Number(effectiveAgencyId.value || 0);
  if (!agencyId) throw new Error('Select an agency for this virtual session.');
  const clientId = Number(primarySessionClientId.value || 0);
  if (!clientId) throw new Error('Select a client for this individual session.');
  const dateYmd = addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dayName));
  const startAt = `${dateYmd}T${pad2(hour)}:${pad2(startMinute)}:00`;
  const endAt = `${dateYmd}T${pad2(endHour)}:${pad2(endMinute)}:00`;
  const clientLabel = primarySessionClientLabel.value || `Client ${clientId}`;
  const baseTitle = `Virtual session · ${clientLabel}`;
  const attendeeNote = buildVirtualAttendeeNotes();
  const descriptionParts = [
    String(requestNotes.value || '').trim() || 'Platform counseling video session.',
    `Client id: ${clientId}`,
    attendeeNote
  ].filter(Boolean);
  const description = descriptionParts.join('\n\n');
  const firstGuardianUserId = Array.from(virtualSessionSelectedGuardianKeySet.value.values())
    .map((key) => Number(String(key || '').split(':')[0] || 0))
    .find((n) => n > 0) || null;

  let appointmentId = null;
  if (alsoBookOffice && officeId) {
    if (!officeBookingValid.value) throw new Error('Choose a valid office booking window.');
    if (showClinicalBookingFields.value && bookingClassificationInvalidReason.value) {
      throw new Error(bookingClassificationInvalidReason.value);
    }
    const roomId = viewMode.value === 'office_layout'
      ? (Number(selectedOfficeRoomId.value || 0) || null)
      : null;
    const recurrence = String(officeBookingRecurrence.value || 'ONCE');
    const r = await api.post('/office-schedule/booking-requests', {
      officeLocationId: officeId,
      roomId,
      startAt,
      endAt,
      recurrence,
      openToAlternativeRoom: !roomId,
      notes: description,
      clientId,
      ...normalizeBookingSelectionPayload(),
      ...requestedProviderPayload()
    });
    appointmentId = Number(r?.data?.appointmentId || r?.data?.eventId || r?.data?.officeEventId || 0) || null;
    if (r?.data?.kind === 'auto_booked') await loadSelectedOfficeGrid();
  }

  const scheduleResp = await api.post(`/users/${uid}/schedule-events`, {
    agencyId,
    kind: 'PERSONAL_EVENT',
    title: baseTitle,
    description,
    allDay: false,
    startAt,
    endAt,
    isPrivate: false,
    clientId,
    // Platform video room does not depend on Google Calendar.
    allowLocalOnly: true
  });

  const data = await createCounselingSession({
    agencyId,
    title: baseTitle,
    clientUserId: firstGuardianUserId,
    ...(appointmentId ? { appointmentId } : {})
  });
  const sessionKey = data?.session?.publicId || data?.session?.id;
  if (!sessionKey) throw new Error('Session was scheduled, but the platform video room could not be created.');

  virtualSessionScheduledSessionKey.value = String(sessionKey);
  virtualSessionShareUrl.value = buildVirtualSessionShareUrl(data?.sharePath || '');
  virtualSessionShareCopied.value = false;
  virtualSessionGoogleWarning.value = String(scheduleResp?.data?.googleCalendarWarning || '').trim();
  clearSelectedActionSlots();
  ensureScheduleAgencyVisible(agencyId);
  patchScheduleSummaryWithBookedEvent({
    eventId: scheduleResp?.data?.event?.providerScheduleEventId || scheduleResp?.data?.event?.id,
    agencyId,
    title: baseTitle,
    startAt,
    endAt,
    kind: 'PERSONAL_EVENT'
  });
  refreshScheduleSummaryInBackground();
};

const submitRequest = async () => {
  if (actionRequiresAgency.value && !effectiveAgencyId.value) {
    modalError.value = 'Select an agency for this action.';
    return;
  }
  if (requestType.value === 'school' && !schoolWindowValid.value) {
    modalError.value = 'School daytime availability must be on weekdays between 6 AM and 6 PM.';
    return;
  }

  // Intake confirmation step (in-person office assigned slots only)
  if (requestType.value === 'intake_inperson_on' && !intakeConfirmStep.value) {
    intakeConfirmStep.value = 'ask_inperson';
    return;
  }
  if (requestType.value === 'intake_virtual_on' && !intakeConfirmStep.value) {
    intakeConfirmStep.value = 'ask_virtual';
    return;
  }

  try {
    submitting.value = true;
    modalError.value = '';
    let createdScheduleEvents = [];
    let refreshInBackground = false;
    let forceRefreshSummary = false;
    let needsOfficeRefresh = false;

    const dn = modalDay.value;
    const h = Number(effectiveModalStartHour.value || modalHour.value);
    const endH = Number(modalEndHour.value);
    const startMinute = canUseQuarterHourInput.value ? Number(modalStartMinute.value || 0) : 0;
    const endMinute = canUseQuarterHourInput.value ? Number(modalEndMinute.value || 0) : 0;
    const startTotalMinutes = (h * 60) + startMinute;
    const endTotalMinutes = (endH * 60) + endMinute;
    if (!(isScheduleEventRequestType.value && scheduleEventAllDay.value) && !(endTotalMinutes > startTotalMinutes)) {
      throw new Error('End time must be after start time.');
    }

    if (requestType.value === 'start_video') {
      const ctx = modalContext.value || {};
      const appointmentId = Number(ctx.officeEventId || 0);
      if (!appointmentId) throw new Error('Booked office event is required for video.');
      const agencyId = Number(
        ctx.agencyId ||
          props.agencyId ||
          agencyStore?.currentAgency?.id ||
          authStore.user?.agencyId ||
          0
      );
      if (!agencyId) throw new Error('Organization context is required for video.');
      const data = await openCounselingFromAppointment({
        appointmentId,
        agencyId,
        title: 'Telehealth Session'
      });
      const sessionKey = data?.session?.publicId || data?.session?.id;
      if (!sessionKey) throw new Error('Video session could not be created.');
      const slug = String(
        route.params.organizationSlug ||
          agencyStore?.currentAgency?.slug ||
          agencyStore?.currentAgency?.portal_url ||
          ''
      ).trim();
      const path = slug
        ? `/${slug}/counseling/session/${sessionKey}`
        : `/counseling/session/${sessionKey}`;
      closeModal();
      await router.push(path);
      return;
    } else if (requestType.value === 'unbook_slot') {
      const contexts = selectedActionContexts().filter(
        (x) => Number(x?.officeLocationId || 0) > 0 && Number(x?.officeEventId || 0) > 0
      );
      if (!contexts.length) throw new Error('Select a booked office slot first.');
      for (const ctx of contexts) {
        // eslint-disable-next-line no-await-in-loop
        await api.post(`/office-slots/${ctx.officeLocationId}/events/${ctx.officeEventId}/book`, {
          booked: false
        });
      }
      refreshInBackground = true;
      needsOfficeRefresh = true;
    } else if (requestType.value === 'cancel_booking') {
      const contexts = selectedActionContexts().filter(
        (x) => Number(x?.officeLocationId || 0) > 0
          && (Number(x?.officeEventId || 0) > 0 || Number(x?.standingAssignmentId || 0) > 0)
      );
      if (!contexts.length) throw new Error('No booking found for this slot.');
      const scope = cancelBookingScope.value || 'occurrence';
      const seenEvents = new Set();
      const seenStandings = new Set();
      for (const ctx of contexts) {
        const locId = Number(ctx.officeLocationId || selectedOfficeLocationId.value || 0);
        if (!locId) continue;
        const eventId = Number(ctx.officeEventId || 0);
        if (eventId > 0 && !seenEvents.has(eventId)) {
          seenEvents.add(eventId);
          // eslint-disable-next-line no-await-in-loop
          await api.post(`/office-slots/${locId}/events/${eventId}/cancel`, { scope });
        }
        const standingId = Number(ctx.standingAssignmentId || 0);
        if (scope === 'future' && standingId > 0 && !seenStandings.has(standingId)) {
          seenStandings.add(standingId);
          // eslint-disable-next-line no-await-in-loop
          await api.post(`/office-slots/${locId}/assignments/${standingId}/cancel`, {
            scope: 'future',
            date: String(ctx.dateYmd || '').slice(0, 10),
            hour: Number(ctx.hour || 0)
          });
        }
      }
      refreshInBackground = true;
      needsOfficeRefresh = true;
    } else if (isScheduleEventRequestType.value) {
      const uid = Number(props.userId || authStore.user?.id || 0);
      if (!uid) throw new Error('Provider is required.');
      const normalizedAction = String(requestType.value || '');
      const eventKind = scheduleEventKindForAction(normalizedAction);
      const meetingAttendeeUserIds = (normalizedAction === 'agency_meeting' || normalizedAction === 'huddle')
        ? Array.from(selectedMeetingParticipantIdSet.value.values()).map((n) => Number(n || 0)).filter((n) => n > 0)
        : [];
      if ((normalizedAction === 'agency_meeting' || normalizedAction === 'huddle') && !meetingAttendeeUserIds.length) {
        throw new Error('Select at least one participant.');
      }
      let eventAgencyId = null;
      if (scheduleEventRequiresAgency.value) {
        eventAgencyId = Number(effectiveAgencyId.value || 0) || null;
        if (!eventAgencyId) throw new Error('Select an agency for this event type.');
      } else if (isAgencyOptionalScheduleEvent.value) {
        // 0 = all/none (null agency_id); specific id ties the event to that tenant.
        eventAgencyId = Number(scheduleEventAgencyScope.value || 0) || null;
      }
      const title = String(scheduleEventTitle.value || '').trim() || defaultScheduleEventTitleForAction(normalizedAction);
      const reasonCode = eventKind === 'SCHEDULE_HOLD' ? effectiveScheduleHoldReason() : null;
      const isPrivate = !!scheduleEventPrivate.value;
      const meetingTimeZone = (normalizedAction === 'agency_meeting' || normalizedAction === 'huddle') ? browserIanaTimeZone() : null;
      const isMeetingAction = normalizedAction === 'agency_meeting' || normalizedAction === 'huddle';
      const recurrence = isMeetingAction
        ? String(scheduleEventRecurrence.value || 'ONCE').trim().toUpperCase()
        : 'ONCE';
      const recurringRecurrences = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'];
      const recurrenceEndMode = isMeetingAction ? String(scheduleEventRecurrenceEndMode.value || 'count') : 'count';
      const occurrenceCount = recurringRecurrences.includes(recurrence)
        ? recurringMeetingOccurrenceCount(recurrence, recurrenceEndMode, scheduleEventOccurrenceCount.value)
        : 1;
      const recurrenceSeriesId = (isMeetingAction && recurringRecurrences.includes(recurrence))
        ? generateRecurrenceSeriesId()
        : null;
      const recurrencePolicy = (isMeetingAction && recurringRecurrences.includes(recurrence))
        ? (recurrenceEndMode === 'indefinite' ? 'INDEFINITE' : 'FINITE')
        : null;
      let recurrenceIndex = 0;
      const createPlatformVideoLink = isMeetingAction
        && scheduleVideoConfigured.value
        && !!linkMeetingPlatformVideo.value;
      const createMeetLink = isMeetingAction
        ? (createPlatformVideoLink ? false : !!createMeetingMeetLink.value)
        : false;
      if (scheduleEventAllDay.value || normalizedAction === 'schedule_hold_all_day') {
        const ranges = mergeSelectedSlotsByDay({ dayName: dn, startHour: h, endHour: endH });
        const baseDates = Array.from(new Set(ranges.map((x) => String(x.dateYmd || '').slice(0, 10)).filter(Boolean)));
        const recurringDates = Array.from(
          new Set(baseDates.flatMap((dateYmd) => scheduleEventOccurrenceDates(dateYmd, recurrence, occurrenceCount)))
        );
        for (const dateYmd of recurringDates) {
          const startDate = String(dateYmd).slice(0, 10);
          const endDate = addDaysYmd(startDate, 1);
          // eslint-disable-next-line no-await-in-loop
          const resp = await api.post(`/users/${uid}/schedule-events`, {
            agencyId: eventAgencyId,
            kind: eventKind,
            title,
            description: requestNotes.value || '',
            allDay: true,
            startDate,
            endDate,
            reasonCode,
            isPrivate,
            ...(isMeetingAction
              ? {
                  attendeeUserIds: meetingAttendeeUserIds,
                  createMeetLink,
                  createPlatformVideoLink,
                  recurrenceSeriesId,
                  recurrenceFrequency: recurringRecurrences.includes(recurrence) ? recurrence : null,
                  recurrencePolicy,
                  recurrenceIndex: recurringRecurrences.includes(recurrence) ? recurrenceIndex : null,
                  ...(meetingTimeZone ? { timeZone: meetingTimeZone } : {})
                }
              : {})
          });
          if (isMeetingAction && recurringRecurrences.includes(recurrence)) recurrenceIndex += 1;
          const created = resp?.data?.event || null;
          if (created) createdScheduleEvents.push(created);
        }
      } else {
        const ranges = mergeSelectedSlotsByDay({ dayName: dn, startHour: h, endHour: endH });
        for (const row of ranges) {
          const dates = scheduleEventOccurrenceDates(String(row.dateYmd).slice(0, 10), recurrence, occurrenceCount);
          for (const dateYmd of dates) {
            const startAt = `${String(dateYmd).slice(0, 10)}T${pad2(Number(row.startHour))}:${pad2(startMinute)}:00`;
            const endAt = `${String(dateYmd).slice(0, 10)}T${pad2(Number(row.endHour))}:${pad2(endMinute)}:00`;
            // eslint-disable-next-line no-await-in-loop
            const resp = await api.post(`/users/${uid}/schedule-events`, {
              agencyId: eventAgencyId,
              kind: eventKind,
              title,
              description: requestNotes.value || '',
              allDay: false,
              startAt,
              endAt,
              reasonCode,
              isPrivate,
              ...(isMeetingAction
                ? {
                    attendeeUserIds: meetingAttendeeUserIds,
                    createMeetLink,
                    createPlatformVideoLink,
                    recurrenceSeriesId,
                    recurrenceFrequency: recurringRecurrences.includes(recurrence) ? recurrence : null,
                    recurrencePolicy,
                    recurrenceIndex: recurringRecurrences.includes(recurrence) ? recurrenceIndex : null,
                    ...(meetingTimeZone ? { timeZone: meetingTimeZone } : {})
                  }
                : {})
            });
            if (isMeetingAction && recurringRecurrences.includes(recurrence)) recurrenceIndex += 1;
            const created = resp?.data?.event || null;
            if (created) createdScheduleEvents.push(created);
          }
        }
      }
      if (createdScheduleEvents.length) {
        refreshInBackground = true;
        if (eventAgencyId) ensureScheduleAgencyVisible(eventAgencyId);
        if ((requestType.value === 'agency_meeting' || requestType.value === 'huddle') && createAgendaDraftItems.value.length) {
          const items = [...createAgendaDraftItems.value];
          for (const ev of createdScheduleEvents) {
            const eid = ev?.providerScheduleEventId ?? ev?.id;
            if (eid) postAgendaItemsForNewMeeting('provider_schedule_event', eid, items).catch(() => {});
          }
          createAgendaDraftItems.value = [];
        }
      }
    } else if (requestType.value === 'office') {
      const officeId = Number(selectedOfficeLocationId.value || 0);
      if (!officeId) throw new Error('Select an office first.');
      if (!officeBookingValid.value) throw new Error('Select an available room (or choose “Any open room”).');
      const recurrence = modalIsOneTimeAssignedSlot.value
        ? 'ONCE'
        : String(officeBookingRecurrence.value || 'ONCE');
      const recurringRecurrences = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'];
      const occurrenceCount = recurringRecurrences.includes(recurrence)
        ? Math.min(104, Math.max(1, Number(officeBookingOccurrenceCount.value) || 6))
        : null;
      const contexts = selectedActionContexts().filter((ctx) => Number(ctx?.officeLocationId || 0) > 0);
      if (!contexts.length) {
        throw new Error('Select an assigned office slot to mark booked. Use Office request for request workflow.');
      }
      if (recurrence === 'ONCE') {
        const bookableContexts = contexts.filter((ctx) => {
          const officeEventId = Number(ctx?.officeEventId || 0);
          const state = String(ctx?.slotState || '').toUpperCase();
          return officeEventId > 0 && ['ASSIGNED_AVAILABLE', 'ASSIGNED_TEMPORARY'].includes(state);
        });
        if (bookableContexts.length !== contexts.length) {
          throw new Error('Office booking requires an assigned slot occurrence. Use Office request for request workflow.');
        }
        for (const ctx of bookableContexts) {
          // eslint-disable-next-line no-await-in-loop
          await api.post(`/office-slots/${ctx.officeLocationId}/events/${ctx.officeEventId}/book`, {
            booked: true,
            agencyId: effectiveAgencyId.value || undefined,
            ...normalizeBookingSelectionPayload()
          });
        }
        refreshInBackground = true;
        needsOfficeRefresh = true;
      } else {
        for (const ctx of contexts) {
          const standingAssignmentId = Number(ctx?.standingAssignmentId || 0);
          const officeEventId = Number(ctx?.officeEventId || 0);
          if (standingAssignmentId > 0) {
            // eslint-disable-next-line no-await-in-loop
            await api.post(`/office-slots/${ctx.officeLocationId}/assignments/${standingAssignmentId}/booking-plan`, {
              bookedFrequency: recurrence,
              bookedOccurrenceCount: Number(occurrenceCount || 6),
              bookingStartDate: String(ctx?.dateYmd || '').slice(0, 10) || addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dn)),
              recurringUntilDate: addDaysYmd(String(ctx?.dateYmd || '').slice(0, 10) || addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dn)), 364),
              ...normalizeBookingSelectionPayload()
            });
            if (officeEventId > 0) {
              // eslint-disable-next-line no-await-in-loop
              await api.post(`/office-slots/${ctx.officeLocationId}/events/${officeEventId}/book`, {
                booked: true,
                agencyId: effectiveAgencyId.value || undefined,
                ...normalizeBookingSelectionPayload()
              });
            }
            continue;
          }
          if (officeEventId > 0) {
            // eslint-disable-next-line no-await-in-loop
            await api.post(`/office-slots/${ctx.officeLocationId}/events/${officeEventId}/booking-plan`, {
              bookedFrequency: recurrence,
              bookedOccurrenceCount: Number(occurrenceCount || 6),
              bookingStartDate: String(ctx?.dateYmd || '').slice(0, 10) || addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dn)),
              recurringUntilDate: addDaysYmd(String(ctx?.dateYmd || '').slice(0, 10) || addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dn)), 364),
              ...normalizeBookingSelectionPayload()
            });
            // eslint-disable-next-line no-await-in-loop
            await api.post(`/office-slots/${ctx.officeLocationId}/events/${officeEventId}/book`, {
              booked: true,
              agencyId: effectiveAgencyId.value || undefined,
              ...normalizeBookingSelectionPayload()
            });
            continue;
          }
          throw new Error('Office booking requires an assigned slot occurrence. Use Office request for request workflow.');
        }
        refreshInBackground = true;
        needsOfficeRefresh = true;
      }
    } else if (requestType.value === 'individual_session' || requestType.value === 'group_session') {
      const officeId = Number(selectedOfficeLocationId.value || 0);
      const modality = String(bookingModality.value || '').toUpperCase();
      const isVirtualIndividual = requestType.value === 'individual_session' && modality === 'TELEHEALTH';

      if (requestType.value === 'individual_session' && !modality) {
        throw new Error('Choose Virtual or In-person.');
      }
      if (requestType.value === 'individual_session' && !primarySessionClientId.value) {
        throw new Error('Select a client for this individual session.');
      }
      if (requestType.value === 'individual_session' && modality === 'IN_PERSON' && !officeId) {
        throw new Error('In-person sessions need an office selected in the toolbar.');
      }
      if (requestType.value === 'group_session' && !officeId) {
        throw new Error('Select an office first.');
      }

      // Virtual sessions are not office bookings unless the user opts into a room request.
      if (isVirtualIndividual && !(sessionAlsoRequestOffice.value && officeId > 0)) {
        if (showClinicalBookingFields.value && bookingClassificationInvalidReason.value) {
          throw new Error(bookingClassificationInvalidReason.value);
        }
        if (linkPlatformVideoRoom.value) {
          if (virtualSessionScheduledSessionKey.value) {
            await pushCounselingSessionRoute(virtualSessionScheduledSessionKey.value);
            closeModal();
            return;
          }
          await completePlatformVirtualSessionBooking({
            dayName: dn,
            hour: h,
            startMinute,
            endHour: endH,
            endMinute,
            alsoBookOffice: false,
            officeId: 0
          });
          // Keep modal open so the join link can be copied.
          modalError.value = '';
          officeReminderToast.value = virtualSessionGoogleWarning.value
            ? `Virtual session scheduled (Google Calendar not synced). Copy the join link above.`
            : 'Virtual session scheduled. Copy the join link above.';
          setTimeout(() => { officeReminderToast.value = ''; }, 6000);
          return;
        }
        // Virtual without platform video room: personal schedule event only (no office room).
        const agencyId = Number(effectiveAgencyId.value || 0);
        if (!agencyId) throw new Error('Select an agency for this virtual session.');
        const dateYmd = addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dn));
        const startAt = `${dateYmd}T${pad2(h)}:${pad2(startMinute)}:00`;
        const endAt = `${dateYmd}T${pad2(endH)}:${pad2(endMinute)}:00`;
        const bookingSelection = normalizeBookingSelectionPayload();
        const titleParts = ['Virtual session'];
        if (primarySessionClientLabel.value) titleParts.push(primarySessionClientLabel.value);
        if (bookingSelection.serviceCode) titleParts.push(bookingSelection.serviceCode);
        const scheduleResp = await api.post(`/users/${Number(scheduleActorUserId.value || props.userId || authStore.user?.id || 0)}/schedule-events`, {
          agencyId,
          kind: 'PERSONAL_EVENT',
          title: titleParts.join(' · '),
          description: [
            String(requestNotes.value || '').trim(),
            bookingSelection.clientId ? `Client id: ${bookingSelection.clientId}` : '',
            buildVirtualAttendeeNotes(),
            bookingSelection.appointmentTypeCode ? `Type: ${bookingSelection.appointmentTypeCode}` : '',
            bookingSelection.serviceCode ? `Service: ${bookingSelection.serviceCode}` : '',
            bookingSelection.serviceLocationId ? `Location id: ${bookingSelection.serviceLocationId}` : ''
          ].filter(Boolean).join('\n'),
          allDay: false,
          startAt,
          endAt,
          isPrivate: false,
          allowLocalOnly: true,
          ...bookingSelection
        });
        clearSelectedActionSlots();
        ensureScheduleAgencyVisible(agencyId);
        patchScheduleSummaryWithBookedEvent({
          eventId: scheduleResp?.data?.event?.providerScheduleEventId || scheduleResp?.data?.event?.id,
          agencyId,
          title: titleParts.join(' · '),
          startAt,
          endAt,
          kind: 'PERSONAL_EVENT'
        });
        refreshScheduleSummaryInBackground();
        closeModal();
        return;
      }

      if (!officeBookingValid.value) throw new Error('Select an available room (or choose “Any open room”).');
      if (showClinicalBookingFields.value && bookingClassificationInvalidReason.value) {
        throw new Error(bookingClassificationInvalidReason.value);
      }
      const roomId = viewMode.value === 'office_layout'
        ? (Number(selectedOfficeRoomId.value || 0) || null)
        : null;
      const recurrence = String(officeBookingRecurrence.value || 'ONCE');
      const recurringRecurrences = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'];
      const occurrenceCount = recurringRecurrences.includes(recurrence)
        ? Math.min(104, Math.max(1, Number(officeBookingOccurrenceCount.value) || 6))
        : null;
      const targets = sortedSelectedActionSlots().length ? sortedSelectedActionSlots() : [{
        dateYmd: addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dn)),
        hour: h
      }];
      for (const t of targets) {
        const startAt = `${String(t.dateYmd).slice(0, 10)}T${pad2(Number(t.hour || h))}:00:00`;
        const endAt = `${String(t.dateYmd).slice(0, 10)}T${pad2(Math.min(Number(t.hour || h) + Math.max(1, endH - h), 22))}:00:00`;
        // eslint-disable-next-line no-await-in-loop
        const r = await api.post('/office-schedule/booking-requests', {
          officeLocationId: officeId,
          roomId,
          startAt,
          endAt,
          recurrence,
          ...(occurrenceCount ? { bookedOccurrenceCount: occurrenceCount } : {}),
          openToAlternativeRoom: !roomId,
          notes: requestNotes.value || '',
          ...normalizeBookingSelectionPayload(),
          ...requestedProviderPayload()
        });
        if (r?.data?.kind === 'auto_booked') {
          // eslint-disable-next-line no-await-in-loop
          await loadSelectedOfficeGrid();
        }
      }
      // Optional: also request office when virtual + office already selected (user opted in).
      if (isVirtualIndividual && officeId && sessionAlsoRequestOffice.value) {
        // Office booking-request above already covers the room; no separate request needed.
      }
    } else if (requestType.value === 'portal_intake') {
      const agencyId = Number(effectiveAgencyId.value || 0);
      if (!agencyId) throw new Error('Select an agency for portal availability.');
      if (!(endH > h)) throw new Error('End time must be after start time.');
      await ensureVirtualWorkingHoursForRange({ dayName: dn, startHour: h, endHour: endH });
      // Optionally also submit an office request for the same window when an office is selected.
      const officeId = Number(selectedOfficeLocationId.value || 0);
      if (sessionAlsoRequestOffice.value && officeId) {
        const baseDateYmd = addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dn));
        const slots = [{
          weekday: weekdayFromYmd(baseDateYmd),
          startHour: h,
          endHour: endH
        }];
        await api.post('/availability/office-requests', {
          agencyId,
          notes: requestNotes.value || 'Linked to portal intake availability (optional office request).',
          officeLocationIds: [officeId],
          recurrence: 'ONCE',
          requestedStartDate: baseDateYmd,
          slots
        });
        needsOfficeRefresh = true;
      }
      forceRefreshSummary = true;
      officeReminderToast.value = sessionAlsoRequestOffice.value && officeId
        ? 'Portal intake hours published. Office request submitted for the same window.'
        : 'Portal intake hours published — not tied to an office. New clients can request this time online.';
      setTimeout(() => { officeReminderToast.value = ''; }, 6000);
    } else if (requestType.value === 'office_request_only') {
      // Always use modal's hour range (End time dropdown) as source of truth; shift/drag select is unreliable in office layout
      const recurrence = String(officeBookingRecurrence.value || 'ONCE').toUpperCase();
      const recurringRecurrences = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'];
      const occurrenceMax = recurrence === 'WEEKLY' ? 6 : 104;
      const occurrenceCount = recurringRecurrences.includes(recurrence)
        ? Math.min(occurrenceMax, Math.max(1, Number(officeBookingOccurrenceCount.value) || (recurrence === 'WEEKLY' ? 6 : 1)))
        : null;
      if (occurrenceCount) officeBookingOccurrenceCount.value = occurrenceCount;
      const baseRoomId = viewMode.value === 'office_layout' ? (Number(selectedOfficeRoomId.value || 0) || Number(modalContext.value?.roomId || 0) || 0) : 0;
      const baseDateYmd = addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dn));
      const targets = Array.from({ length: Math.max(1, endH - h) }, (_, i) => ({
        dateYmd: baseDateYmd,
        dayName: dn,
        hour: h + i,
        roomId: baseRoomId
      }));
      const roomIds = [...new Set(targets.map((t) => Number(t.roomId || 0)).filter((n) => n > 0))];
      const singleRoomId = roomIds.length === 1 ? roomIds[0] : 0;
      const dateToHours = new Map();
      for (const t of targets) {
        const dateKey = String(t.dateYmd || baseDateYmd).slice(0, 10);
        if (!dateToHours.has(dateKey)) dateToHours.set(dateKey, []);
        dateToHours.get(dateKey).push(Number(t.hour || h));
      }
      const slots = [];
      for (const [dateYmdKey, hoursList] of dateToHours.entries()) {
        const weekday = weekdayFromYmd(dateYmdKey);
        if (!(weekday >= 0 && weekday <= 6)) continue;
        const uniq = Array.from(new Set(hoursList)).sort((a, b) => a - b);
        let start = null;
        let prev = null;
        for (const val of uniq) {
          if (start === null) {
            start = val;
            prev = val;
            continue;
          }
          if (val === prev + 1) {
            prev = val;
            continue;
          }
          slots.push({
            weekday,
            startHour: start,
            endHour: prev + 1,
            roomId: singleRoomId || undefined
          });
          start = val;
          prev = val;
        }
        if (start !== null) {
          slots.push({
            weekday,
            startHour: start,
            endHour: prev + 1,
            roomId: singleRoomId || undefined
          });
        }
      }
      await api.post('/availability/office-requests', {
        agencyId: effectiveAgencyId.value,
        notes: requestNotes.value || '',
        officeLocationIds: Number(selectedOfficeLocationId.value || 0) ? [Number(selectedOfficeLocationId.value)] : [],
        recurrence,
        ...(occurrenceCount ? { bookedOccurrenceCount: occurrenceCount } : {}),
        requestedStartDate: baseDateYmd,
        slots
      });
      forceRefreshSummary = true;
      invalidateScheduleSummaryCacheForUser(props.userId);
      await loadSelectedOfficeGrid();
    } else if (requestType.value === 'school') {
      if (isAdminMode.value) throw new Error('School availability requests must be created from the provider schedule.');
      if (!canUseSchool(dn, h, endH)) throw new Error('School daytime availability must be on weekdays and between 06:00 and 18:00.');
      const targets = sortedSelectedActionSlots().length ? sortedSelectedActionSlots() : [{
        dateYmd: addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dn)),
        dayName: dn,
        hour: h
      }];
      const byDay = new Map();
      for (const t of targets) {
        const day = String(t.dayName || dayNameForDateYmd(t.dateYmd) || dn);
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day).push(Number(t.hour || h));
      }
      const blocks = [];
      for (const [day, hoursList] of byDay.entries()) {
        const uniq = Array.from(new Set(hoursList)).sort((a, b) => a - b);
        let start = null;
        let prev = null;
        for (const val of uniq) {
          if (start === null) {
            start = val;
            prev = val;
            continue;
          }
          if (val === prev + 1) {
            prev = val;
            continue;
          }
          const end = prev + 1;
          if (canUseSchool(day, start, end)) {
            blocks.push({ dayOfWeek: day, startTime: `${pad2(start)}:00`, endTime: `${pad2(end)}:00` });
          }
          start = val;
          prev = val;
        }
        if (start !== null) {
          const end = prev + 1;
          if (canUseSchool(day, start, end)) {
            blocks.push({ dayOfWeek: day, startTime: `${pad2(start)}:00`, endTime: `${pad2(end)}:00` });
          }
        }
      }
      if (!blocks.length) throw new Error('No selected slots are valid for school daytime availability.');
      await api.post('/availability/school-requests', {
        agencyId: effectiveAgencyId.value,
        notes: requestNotes.value || '',
        blocks
      });
    } else if (requestType.value === 'supervision') {
      if (supervisionProvidersLoading.value) throw new Error('Providers are still loading.');
      const sessionType = supervisionEffectiveSessionType.value;
      const participantId = Number(selectedSupervisionParticipantId.value || 0);
      const additionalAttendeeUserIds = Array.from(
        new Set(
          (selectedSupervisionAdditionalParticipantIds.value || [])
            .map((n) => Number(n || 0))
            .filter((n) => n > 0 && n !== participantId)
        )
      );
      const actorId = Number(authStore.user?.id || 0);
      if (!actorId) throw new Error('Not signed in.');
      if (!participantId) throw new Error('Please select a participant.');
      if (sessionType === 'group' && additionalAttendeeUserIds.length < 2) {
        throw new Error('Group supervision requires at least 2 additional participants.');
      }
      const dayIdx = orderedDays.value.indexOf(String(dn)) - (effectiveWeekStartsOn.value === 'sunday' ? 1 : 0);
      if (dayIdx < -1) throw new Error('Invalid day');
      const dateYmd = addDaysYmd(weekStart.value, dayIdx);
      const recurrence = String(supervisionRecurrence.value || 'ONCE').trim().toUpperCase();
      const recurringRecurrences = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'];
      const occurrenceCount = recurringRecurrences.includes(recurrence)
        ? recurringMeetingOccurrenceCount(recurrence, supervisionRecurrenceEndMode.value, supervisionOccurrenceCount.value)
        : 1;
      const dates = scheduleEventOccurrenceDates(dateYmd, recurrence, occurrenceCount);
      const createdSessionIds = [];
      for (const occYmd of dates) {
        const startAt = `${String(occYmd).slice(0, 10)}T${pad2(h)}:${pad2(startMinute)}:00`;
        const endAt = `${String(occYmd).slice(0, 10)}T${pad2(endH)}:${pad2(endMinute)}:00`;
        // eslint-disable-next-line no-await-in-loop
        const supvRes = await api.post('/supervision/sessions', {
          agencyId: effectiveAgencyId.value,
          supervisorUserId: actorId,
          superviseeUserId: participantId,
          sessionType,
          additionalAttendeeUserIds,
          startAt,
          endAt,
          notes: requestNotes.value || '',
          createMeetLink: false,
          modality: 'virtual'
        });
        const sessionId = Number(supvRes?.data?.session?.id || 0);
        if (sessionId > 0) createdSessionIds.push(sessionId);
      }
      if (createdSessionIds.length && createAgendaDraftItems.value.length) {
        for (const sessionId of createdSessionIds) {
          // eslint-disable-next-line no-await-in-loop
          await postAgendaItemsForNewMeeting('supervision_session', sessionId);
        }
      }
      forceRefreshSummary = true;
      invalidateScheduleSummaryCacheForUser(props.userId);
    } else if (requestType.value === 'extend_assignment') {
      const contexts = selectedActionContexts().filter(
        (x) => Number(x?.officeLocationId || 0) > 0 && Number(x?.standingAssignmentId || 0) > 0
      );
      if (!contexts.length) throw new Error('Select an assigned office slot with standing assignment first.');
      for (const ctx of contexts) {
        const extCount = Number(ctx?.assignmentTemporaryExtensionCount ?? 0);
        const mode = String(ctx?.assignmentAvailabilityMode || '').toUpperCase();
        if (mode === 'TEMPORARY' && extCount >= 2) {
          throw new Error('Extension limit reached. Please submit a new office request.');
        }
        if (mode === 'TEMPORARY') {
          // eslint-disable-next-line no-await-in-loop
          await api.post(`/office-slots/${ctx.officeLocationId}/assignments/${ctx.standingAssignmentId}/extend-temporary`);
        } else {
          // AVAILABLE: confirm keep-available (refresh last_two_week_confirmed_at)
          // eslint-disable-next-line no-await-in-loop
          await api.post(`/office-slots/${ctx.officeLocationId}/assignments/${ctx.standingAssignmentId}/keep-available`, { acknowledged: true });
        }
      }
    } else if (requestType.value === 'forfeit_slot') {
      const scope = forfeitScope.value === 'future' && hasFutureForfeitSupport.value ? 'future' : 'occurrence';
      const contexts = selectedActionContexts().filter(
        (x) => Number(x?.officeLocationId || 0) > 0 && (Number(x?.officeEventId || 0) > 0 || Number(x?.standingAssignmentId || 0) > 0)
      );
      if (!contexts.length) throw new Error('Select an assigned/booked office slot first.');
      if (!ackForfeit.value) throw new Error('Please acknowledge that you understand this slot will be forfeit.');
      for (const ctx of contexts) {
        const officeLocationId = Number(ctx.officeLocationId || 0);
        const officeEventId = Number(ctx.officeEventId || 0);
        const standingAssignmentId = Number(ctx.standingAssignmentId || 0);
        if (officeEventId > 0) {
          // eslint-disable-next-line no-await-in-loop
          await api.post(`/office-slots/${officeLocationId}/events/${officeEventId}/forfeit`, {
            acknowledged: true,
            scope
          });
        } else if (standingAssignmentId > 0 && scope === 'future') {
          // eslint-disable-next-line no-await-in-loop
          await api.post(`/office-slots/${officeLocationId}/assignments/${standingAssignmentId}/forfeit`, {
            acknowledged: true,
            scope: 'future'
          });
        } else if (standingAssignmentId > 0) {
          throw new Error('This slot only supports forfeit all future (no single occurrence).');
        }
      }
      forceRefreshSummary = true;
      invalidateScheduleSummaryCacheForUser(props.userId);
    } else if (requestType.value === 'intake_virtual_on' || requestType.value === 'intake_virtual_off') {
      const enabled = requestType.value === 'intake_virtual_on';
      const contexts = selectedActionContexts().filter((x) => Number(x?.officeEventId || 0) > 0);
      if (!contexts.length) throw new Error('Select an assigned office slot first.');
      for (const ctx of contexts) {
        if (enabled) {
          // eslint-disable-next-line no-await-in-loop
          await ensureVirtualWorkingHoursForRange({
            dayName: ctx.dayName,
            startHour: Number(ctx.hour || h),
            endHour: Number(ctx.hour || h) + 1
          });
        }
        // eslint-disable-next-line no-await-in-loop
        await api.post(`/office-slots/${ctx.officeLocationId}/events/${ctx.officeEventId}/virtual-intake`, {
          enabled,
          agencyId: effectiveAgencyId.value
        });
      }
      intakeConfirmChoice.value = null;
    } else if (requestType.value === 'intake_inperson_on' || requestType.value === 'intake_inperson_off') {
      const enabled = requestType.value === 'intake_inperson_on';
      const enableBoth = enabled && intakeConfirmChoice.value === 'both';
      const contexts = selectedActionContexts().filter((x) => Number(x?.officeEventId || 0) > 0);
      if (!contexts.length) throw new Error('Select an assigned office slot first.');
      for (const ctx of contexts) {
        const state = String(ctx.slotState || '').toUpperCase();
        if (enabled && !['ASSIGNED_AVAILABLE', 'ASSIGNED_TEMPORARY', 'ASSIGNED_BOOKED'].includes(state)) {
          throw new Error('In-person intake can only be enabled on assigned office slots.');
        }
        if (enableBoth) {
          // eslint-disable-next-line no-await-in-loop
          await ensureVirtualWorkingHoursForRange({
            dayName: ctx.dayName,
            startHour: Number(ctx.hour || h),
            endHour: Number(ctx.hour || h) + 1
          });
          // eslint-disable-next-line no-await-in-loop
          await api.post(`/office-slots/${ctx.officeLocationId}/events/${ctx.officeEventId}/virtual-intake`, {
            enabled: true,
            agencyId: effectiveAgencyId.value
          });
        }
        // eslint-disable-next-line no-await-in-loop
        await api.post(`/office-slots/${ctx.officeLocationId}/events/${ctx.officeEventId}/in-person-intake`, {
          enabled,
          agencyId: effectiveAgencyId.value
        });
      }
      intakeConfirmChoice.value = null;
    } else {
      throw new Error('Invalid request type.');
    }

    closeModal();
    clearSelectedActionSlots();
    if (needsOfficeRefresh) {
      invalidateScheduleSummaryCacheForUser(props.userId);
      const tasks = [load({ forceRefresh: true })];
      if (Number(selectedOfficeLocationId.value || 0) > 0) {
        tasks.push(loadSelectedOfficeGrid());
      }
      await Promise.all(tasks);
    } else if (refreshInBackground) {
      const current = summary.value && typeof summary.value === 'object' ? summary.value : null;
      if (current) {
        const mapped = createdScheduleEvents.map((ev) => ({
          id: Number(ev?.providerScheduleEventId || ev?.id || 0) || Date.now(),
          kind: String(ev?.kind || '').trim().toUpperCase() || 'PERSONAL_EVENT',
          title: String(ev?.title || '').trim() || 'Schedule event',
          isPrivate: !!ev?.isPrivate,
          allDay: !!ev?.allDay,
          startAt: ev?.startAt || null,
          endAt: ev?.endAt || null,
          startDate: ev?.startDate || null,
          endDate: ev?.endDate || null,
          reasonCode: ev?.reasonCode || null,
          recurrenceSeriesId: ev?.recurrenceSeriesId || null,
          recurrenceFrequency: ev?.recurrenceFrequency || null,
          recurrencePolicy: ev?.recurrencePolicy || null,
          recurrenceIndex: ev?.recurrenceIndex ?? null,
          htmlLink: ev?.htmlLink || null,
          appJoinUrl: ev?.appJoinUrl || null,
          agencyId: Number(ev?.agencyId || 0) || null,
          _agencyId: Number(ev?.agencyId || 0) || null
        }));
        current.scheduleEvents = [...(Array.isArray(current.scheduleEvents) ? current.scheduleEvents : []), ...mapped];
        summary.value = { ...current };
      }
      void load();
    } else {
      await load({ forceRefresh: forceRefreshSummary });
      if (forceRefreshSummary && Number(selectedOfficeLocationId.value || 0) > 0) {
        await loadSelectedOfficeGrid();
      }
    }
  } catch (e) {
    modalError.value = e.response?.data?.error?.message || e.message || 'Failed to submit request';
  } finally {
    submitting.value = false;
  }
};

watch(requestType, (t) => {
  if (!['supervision', 'agency_meeting', 'huddle', 'personal_event', 'schedule_hold', 'indirect_services'].includes(String(t || ''))) {
    modalStartMinute.value = 0;
    modalEndMinute.value = 0;
  }
  if (t === 'supervision') {
    if (!['ONCE', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'].includes(String(supervisionRecurrence.value || '').toUpperCase())) {
      supervisionRecurrence.value = 'ONCE';
    }
    if (!['count', 'indefinite'].includes(String(supervisionRecurrenceEndMode.value || ''))) {
      supervisionRecurrenceEndMode.value = 'count';
    }
    supervisionOccurrenceCount.value = Math.min(104, Math.max(1, Number(supervisionOccurrenceCount.value) || 6));
    void loadSupervisionProviders();
  } else if (t === 'agency_meeting' || t === 'huddle') {
    createMeetingMeetLink.value = !scheduleVideoConfigured.value;
  linkMeetingPlatformVideo.value = scheduleVideoConfigured.value;
    if (!['ONCE', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'].includes(String(scheduleEventRecurrence.value || '').toUpperCase())) {
      scheduleEventRecurrence.value = 'ONCE';
    }
    if (!['count', 'indefinite'].includes(String(scheduleEventRecurrenceEndMode.value || ''))) {
      scheduleEventRecurrenceEndMode.value = 'count';
    }
    scheduleEventOccurrenceCount.value = Math.min(104, Math.max(1, Number(scheduleEventOccurrenceCount.value) || 6));
    void loadMeetingCandidates();
  } else if (t === 'individual_session') {
    sessionAlsoRequestOffice.value = false;
    linkPlatformVideoRoom.value = true;
    virtualSessionParticipantSearch.value = '';
    virtualSessionSelectedClientIds.value = [];
    virtualSessionSelectedGuardianKeys.value = [];
    virtualSessionIncludeGuardians.value = false;
    resetVirtualSessionShareState();
    if (!String(bookingModality.value || '').trim()) {
      bookingModality.value = 'TELEHEALTH';
    }
    void loadBookingMetadataForProvider();
    void loadVirtualSessionClients();
  } else if ((t === 'office' || t === 'group_session') && showClinicalBookingFields.value) {
    void loadBookingMetadataForProvider();
  } else if (SCHEDULE_EVENT_ACTIONS.has(String(t || ''))) {
    if (!String(scheduleEventTitle.value || '').trim() || scheduleEventTitle.value === defaultScheduleEventTitleForAction('personal_event')) {
      scheduleEventTitle.value = defaultScheduleEventTitleForAction(String(t || ''));
    }
    if (t === 'schedule_hold_all_day') scheduleEventAllDay.value = true;
    if (t === 'schedule_hold') scheduleEventAllDay.value = false;
    if (t === 'personal_event' || t === 'indirect_services' || t === 'agency_meeting' || t === 'huddle') {
      scheduleEventAllDay.value = false;
    }
    if (['personal_event', 'schedule_hold', 'schedule_hold_all_day'].includes(String(t || ''))) {
      const opts = scheduleEventOrgOptions.value || [];
      const current = Number(scheduleEventAgencyScope.value || 0);
      const validIds = new Set(opts.map((row) => Number(row?.id || 0)).filter((n) => n > 0));
      if (current > 0 && validIds.has(current)) {
        // keep prior choice
      } else if (opts.length === 1) {
        // Single-tenant accounts default to that org; multi-tenant defaults to all/none.
        scheduleEventAgencyScope.value = Number(opts[0].id);
      } else {
        scheduleEventAgencyScope.value = 0;
      }
    }
  }
  if (!['agency_meeting', 'huddle'].includes(String(t || ''))) {
    scheduleEventRecurrence.value = 'ONCE';
    scheduleEventRecurrenceEndMode.value = 'count';
    scheduleEventOccurrenceCount.value = 6;
  }
  if (String(t || '') !== 'supervision') {
    supervisionRecurrence.value = 'ONCE';
    supervisionRecurrenceEndMode.value = 'count';
    supervisionOccurrenceCount.value = 6;
  }
  ensureModalEndTimeValid();
});

watch([modalLockRoomToAssigned, () => modalContext.value?.roomId], ([locked, roomId]) => {
  if (!locked) return;
  selectedOfficeRoomId.value = Number(roomId || 0) || 0;
  officeBookingRecurrence.value = 'ONCE';
});

watch(supervisionEffectiveSessionType, (nextType) => {
  if (String(nextType || '') !== 'group' && supervisionIncludeAllAgencies.value) {
    supervisionIncludeAllAgencies.value = false;
  }
  if (String(requestType.value || '') === 'supervision' && showRequestModal.value) {
    void loadSupervisionProviders();
  }
});

watch(supervisionIncludeAllAgencies, () => {
  if (String(requestType.value || '') !== 'supervision' || !showRequestModal.value) return;
  selectedSupervisionParticipantId.value = 0;
  selectedSupervisionAdditionalParticipantIds.value = [];
  supervisionParticipantSearch.value = '';
  void loadSupervisionProviders();
});

watch(meetingIncludeAllAgencies, () => {
  if (!['agency_meeting', 'huddle'].includes(String(requestType.value || '')) || !showRequestModal.value) return;
  selectedMeetingParticipantIds.value = [];
  meetingParticipantSearch.value = '';
  void loadMeetingCandidates();
});

watch([bookingModality, linkPlatformVideoRoom, virtualSessionIncludeGuardians], () => {
  if (String(requestType.value || '') !== 'individual_session' || !showRequestModal.value) return;
  if (!linkPlatformVideoRoom.value) {
    resetVirtualSessionShareState();
  }
  if (!virtualSessionIncludeGuardians.value) {
    virtualSessionSelectedGuardianKeys.value = [];
  }
  void loadVirtualSessionClients();
});

watch([showRequestModal, requestType, effectiveAgencyId], ([isOpen, type, agencyId], [prevOpen, prevType, prevAgencyId]) => {
  if (!isOpen) return;
  if (String(type || '') === 'individual_session') {
    const currentAgencyId = Number(agencyId || 0);
    const previousAgencyId = Number(prevAgencyId || 0);
    if (currentAgencyId > 0 && currentAgencyId !== previousAgencyId) {
      virtualSessionSelectedClientIds.value = [];
      virtualSessionSelectedGuardianKeys.value = [];
      virtualSessionParticipantSearch.value = '';
      resetVirtualSessionShareState();
      void loadVirtualSessionClients();
    }
    return;
  }
  if (!['agency_meeting', 'huddle'].includes(String(type || ''))) return;
  if (meetingUsingAllAgencies.value) return;
  const currentAgencyId = Number(agencyId || 0);
  const previousAgencyId = Number(prevAgencyId || 0);
  const agencyChanged = currentAgencyId > 0 && currentAgencyId !== previousAgencyId;
  const stayedOnMeeting = ['agency_meeting', 'huddle'].includes(String(prevType || '')) && isOpen === !!prevOpen;
  if (!agencyChanged || !stayedOnMeeting) return;
  selectedMeetingParticipantIds.value = [];
  meetingParticipantSearch.value = '';
  meetingBusyByUserId.value = {};
  if (!currentAgencyId) {
    meetingCandidates.value = [];
    return;
  }
  void loadMeetingCandidates();
});

watch([requestType, modalDay, modalHour, modalEndHour, modalStartMinute, modalEndMinute], ([type]) => {
  if (!['agency_meeting', 'huddle'].includes(String(type || '')) || !showRequestModal.value) return;
  void loadMeetingBusyByParticipant();
});

watch([showRequestModal, requestType, effectiveAgencyId], ([isOpen, type, agencyId], [prevOpen, prevType, prevAgencyId]) => {
  if (!isOpen) return;
  if (String(type || '') !== 'supervision') return;
  if (supervisionUsingAllAgencies.value) return;
  const currentAgencyId = Number(agencyId || 0);
  const previousAgencyId = Number(prevAgencyId || 0);
  const agencyChanged = currentAgencyId > 0 && currentAgencyId !== previousAgencyId;
  const stayedOnSupervision = String(prevType || '') === 'supervision' && isOpen === !!prevOpen;
  if (!agencyChanged || !stayedOnSupervision) return;

  // Reset stale participant/search state when supervision context switches agencies.
  selectedSupervisionParticipantId.value = 0;
  selectedSupervisionAdditionalParticipantIds.value = [];
  supervisionParticipantSearch.value = '';
  if (!currentAgencyId) {
    supervisionProviders.value = [];
    return;
  }
  void loadSupervisionProviders();
});

watch(availableSupervisionParticipants, (rows) => {
  const ids = new Set((rows || []).map((row) => Number(row?.id || 0)).filter((n) => n > 0));
  const selected = Number(selectedSupervisionParticipantId.value || 0);
  if (selected && !ids.has(selected)) selectedSupervisionParticipantId.value = 0;
  selectedSupervisionAdditionalParticipantIds.value = (selectedSupervisionAdditionalParticipantIds.value || [])
    .map((n) => Number(n || 0))
    .filter((n) => n > 0 && ids.has(n) && n !== Number(selectedSupervisionParticipantId.value || 0));
});

watch(availableMeetingCandidates, (rows) => {
  const ids = new Set((rows || []).map((row) => Number(row?.id || 0)).filter((n) => n > 0));
  selectedMeetingParticipantIds.value = (selectedMeetingParticipantIds.value || [])
    .map((n) => Number(n || 0))
    .filter((n) => n > 0 && ids.has(n));
});

watch(selectedSupervisionParticipantId, (nextId) => {
  const primaryId = Number(nextId || 0);
  if (!primaryId) return;
  selectedSupervisionAdditionalParticipantIds.value = (selectedSupervisionAdditionalParticipantIds.value || [])
    .map((n) => Number(n || 0))
    .filter((n) => n > 0 && n !== primaryId);
});

watch(() => summary.value?.supervisionSessions, (rows) => {
  const liveIds = new Set((Array.isArray(rows) ? rows : []).map((row) => Number(row?.id || 0)).filter((n) => n > 0));
  dismissedJoinPromptSessionIds.value = (dismissedJoinPromptSessionIds.value || [])
    .map((n) => Number(n || 0))
    .filter((n) => n > 0 && liveIds.has(n));
}, { deep: true });

watch([showRequestModal, visibleQuickActions], ([isOpen, actions]) => {
  if (!isOpen) return;
  const rows = Array.isArray(actions) ? actions : [];
  const current = String(requestType.value || '').trim();
  if (!current) {
    requestTypeChosenByUser.value = false;
    return;
  }
  // Edit shells are not chooser cards — never wipe them back to the action grid.
  if (APPOINTMENT_EDIT_REQUEST_TYPES.has(current)) return;
  const ids = new Set(rows.map((row) => String(row?.id || '')).filter(Boolean));
  // Never auto-pick a replacement action — return to the chooser when current is unavailable.
  if (!ids.has(current)) {
    requestType.value = '';
    requestTypeChosenByUser.value = false;
  }
}, { deep: true });

watch(
  [bookingServiceCode, modalSessionDurationMinutes, effectiveAgencyId, showClinicalBookingFields, showRequestModal],
  () => {
    if (bookingUnitPreviewTimer) clearTimeout(bookingUnitPreviewTimer);
    bookingUnitPreviewTimer = setTimeout(() => {
      void refreshBookingUnitPreview();
    }, 250);
  }
);

watch([bookingModality, () => bookingServiceLocationOptions.value.length], () => {
  preferDefaultServiceLocation();
});

watch([effectiveAgencyId, showClinicalBookingFields, requestType, showRequestModal], () => {
  if (!showRequestModal.value) return;
  if (!showClinicalBookingFields.value) return;
  if (!['office', 'individual_session', 'group_session'].includes(String(requestType.value || ''))) return;
  void loadBookingMetadataForProvider();
});

watch(bookingAppointmentType, () => {
  const selectedSubtype = normalizeCodeValue(bookingAppointmentSubtype.value);
  if (!selectedSubtype) return;
  const stillValid = bookingSubtypeOptions.value.some((x) => normalizeCodeValue(x?.code) === selectedSubtype);
  if (!stillValid) bookingAppointmentSubtype.value = '';
});

watch([selectedOfficeLocationId, showRequestModal, requestType, showClinicalBookingFields], () => {
  if ((requestType.value === 'office' || requestType.value === 'individual_session' || requestType.value === 'group_session') && showRequestModal.value && showClinicalBookingFields.value) {
    void loadBookingMetadataForProvider();
  }
});

// ---- Supervision edit modal ----
const showSupvModal = ref(false);
const supvModalError = ref('');
const supvSaving = ref(false);
const selectedSupvSessionId = ref(0);
const showAgendaPanel = ref(false);
const createAgendaDraftTitle = ref('');
const createAgendaDraftItems = ref([]);
const supvStartIsoLocal = ref('');
const supvEndIsoLocal = ref('');
const supvNotes = ref('');
const supvCreateMeetLink = ref(false);

const supvDayLabel = ref('');
const supvStartHour = ref(7);
const supvEndHour = ref(8);
const supvPresenters = ref([]);
const supvPresentersLoading = ref(false);
const supvPresentersError = ref('');
const showSupvMeetTrackerModal = ref(false);
const supvMeetOpening = ref(false);
const supvMeetClosing = ref(false);
const supvMeetTrackerError = ref('');
const supvMeetWindowRef = ref(null);
const supvMeetPollTimer = ref(null);
const supvMeetClientSessionKey = ref('');
const supvMeetTrackedSessionId = ref(0);
const supvMeetTrackedSessionLabel = ref('');
const supvArtifactLoading = ref(false);
const supvArtifactSaving = ref(false);
const supvArtifactError = ref('');
const supvTranscriptUrl = ref('');
const supvTranscriptText = ref('');
const supvSummaryText = ref('');
const showSupvAppVideoModal = ref(false);
const supvAppVideoToken = ref('');
const supvAppVideoRoomName = ref('');
const supvAppVideoSessionTitle = ref('');
const supvAppVideoSessionId = ref(0);
const supvAppVideoIsSupervisor = ref(false);
const supvAppVideoRoomMode = ref('main');
const supvAppVideoLobbyEnabled = ref(false);
const supvAppVideoFullscreen = ref(false);
const supvAppVideoError = ref('');
const supvAppVideoLoading = ref(false);

const clearSupvMeetPolling = () => {
  if (supvMeetPollTimer.value) {
    clearInterval(supvMeetPollTimer.value);
    supvMeetPollTimer.value = null;
  }
};

const joinPromptNowMs = ref(Date.now());
let joinPromptTimer = null;
const dismissedJoinPromptSessionIds = ref([]);

const logSupvMeetingLifecycle = async ({ sessionId, eventType }) => {
  const sid = Number(sessionId || selectedSupvSessionId.value || 0);
  if (!sid) return;
  await api.post(`/supervision/sessions/${sid}/meeting-lifecycle`, {
    eventType,
    clientSessionKey: supvMeetClientSessionKey.value || undefined
  });
};

const endTrackedSupvMeet = async () => {
  if (!showSupvMeetTrackerModal.value) return;
  try {
    supvMeetClosing.value = true;
    supvMeetTrackerError.value = '';
    clearSupvMeetPolling();
    await logSupvMeetingLifecycle({ sessionId: supvMeetTrackedSessionId.value, eventType: 'closed' });
    if (supvMeetWindowRef.value && !supvMeetWindowRef.value.closed) {
      try {
        supvMeetWindowRef.value.close();
      } catch {
        // ignore cross-window close issues
      }
    }
    supvMeetWindowRef.value = null;
    supvMeetClientSessionKey.value = '';
    supvMeetTrackedSessionId.value = 0;
    supvMeetTrackedSessionLabel.value = '';
    showSupvMeetTrackerModal.value = false;
  } catch (e) {
    supvMeetTrackerError.value = e?.response?.data?.error?.message || e?.message || 'Failed to log meeting end.';
  } finally {
    supvMeetClosing.value = false;
  }
};

const startAppVideoMeetingFromGrid = async (session) => {
  const sid = Number(session?.id || 0);
  if (!sid) return;
  supvAppVideoLoading.value = true;
  supvAppVideoError.value = '';
  try {
    const resp = await api.get(`/supervision/sessions/${sid}/video-token`);
    const data = resp?.data || {};
    const tok = (data.token || data.data?.token || data.result?.token || '').trim();
    const rn = data.roomName || data.room_name || data.data?.roomName || `supervision-${sid}`;
    if (typeof window !== 'undefined') window.__supvDebugRunId = `run-${Date.now()}`;
    if (!tok) {
      console.warn('[ScheduleGrid] video-token empty:', { status: resp?.status, data });
      supvAppVideoError.value = data?.error?.message || data?.error || 'Video token was empty.';
      return;
    }
    supvMeetClientSessionKey.value = `web-${sid}-${Number(authStore.user?.id || 0)}-${Date.now()}`;
    await logSupvMeetingLifecycle({ sessionId: sid, eventType: 'opened' });
    supvAppVideoToken.value = tok;
    supvAppVideoRoomName.value = rn;
    supvAppVideoSessionTitle.value = data.sessionTitle || data.session_title || '';
    supvAppVideoSessionId.value = sid;
    supvAppVideoIsSupervisor.value = !!data.isSupervisor;
    supvAppVideoRoomMode.value = String(data.roomMode || (String(rn || '').endsWith('-lobby') ? 'lobby' : 'main')).toLowerCase();
    supvAppVideoLobbyEnabled.value = !!data.lobbyEnabledForSession;
    supvAppVideoFullscreen.value = true;
    showSupvAppVideoModal.value = true;
  } catch (e) {
    supvAppVideoError.value = e?.response?.data?.error?.message || e?.message || 'Failed to join video room.';
  } finally {
    supvAppVideoLoading.value = false;
  }
};

const closeSupvAppVideoModal = () => {
  if (supvAppVideoSessionId.value) {
    void logSupvMeetingLifecycle({ sessionId: supvAppVideoSessionId.value, eventType: 'closed' });
  }
  showSupvAppVideoModal.value = false;
  supvAppVideoToken.value = '';
  supvAppVideoRoomName.value = '';
  supvAppVideoSessionTitle.value = '';
  supvAppVideoSessionId.value = 0;
  supvAppVideoIsSupervisor.value = false;
  supvAppVideoRoomMode.value = 'main';
  supvAppVideoLobbyEnabled.value = false;
  supvAppVideoFullscreen.value = false;
};

const startTrackedSupvMeetForSession = async (session) => {
  const appUrl = String(session?.joinUrl || '').trim();
  const meetLink = String(session?.googleMeetLink || '').trim();
  const sid = Number(session?.id || 0);
  if (!sid) return;
  if (appUrl) {
    await startAppVideoMeetingFromGrid(session);
    return;
  }
  const link = meetLink;
  if (!link) return;
  try {
    supvMeetOpening.value = true;
    supvMeetTrackerError.value = '';
    clearSupvMeetPolling();
    supvMeetClientSessionKey.value = `web-${sid}-${Number(authStore.user?.id || 0)}-${Date.now()}`;
    await logSupvMeetingLifecycle({ sessionId: sid, eventType: 'opened' });
    const popup = window.open(link, '_blank', 'noopener,noreferrer,width=1200,height=850');
    if (!popup) {
      throw new Error('Pop-up blocked. Allow pop-ups for this site, then try again.');
    }
    supvMeetTrackedSessionId.value = sid;
    supvMeetTrackedSessionLabel.value = String(session?.counterpartyName || session?.label || `Session ${sid}`);
    supvMeetWindowRef.value = popup;
    showSupvMeetTrackerModal.value = true;
    supvMeetPollTimer.value = setInterval(() => {
      const w = supvMeetWindowRef.value;
      if (!w || w.closed) {
        void endTrackedSupvMeet();
      }
    }, 1200);
  } catch (e) {
    supvMeetTrackerError.value = e?.response?.data?.error?.message || e?.message || 'Failed to start tracked Meet.';
  } finally {
    supvMeetOpening.value = false;
  }
};

const startTrackedSupvMeet = async () => {
  await startTrackedSupvMeetForSession(selectedSupvSession.value || null);
};

const parseMaybeDate = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return null;
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
};
const toDatetimeLocalValue = (raw) => {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return '';
    const p2 = (n) => String(n).padStart(2, '0');
    return `${raw.getFullYear()}-${p2(raw.getMonth() + 1)}-${p2(raw.getDate())}T${p2(raw.getHours())}:${p2(raw.getMinutes())}`;
  }
  const s = String(raw || '').trim();
  if (!s) return '';
  // Prefer wall-clock local (no Z) so datetime-local matches booked local times.
  const wall = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(s);
  if (wall && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    return `${wall[1]}T${wall[2]}:${wall[3]}`;
  }
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '';
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

const joinPromptSession = computed(() => {
  const sessions = Array.isArray(summary.value?.supervisionSessions) ? summary.value.supervisionSessions : [];
  const now = Number(joinPromptNowMs.value || Date.now());
  const dismissed = new Set((dismissedJoinPromptSessionIds.value || []).map((n) => Number(n || 0)));
  const candidates = [];
  for (const s of sessions) {
    const sid = Number(s?.id || 0);
    if (!sid || dismissed.has(sid)) continue;
    const meet = String(s?.googleMeetLink || '').trim();
    const appJoin = String(s?.joinUrl || '').trim();
    if (!meet && !appJoin) continue;
    const status = String(s?.status || '').trim().toUpperCase();
    if (status === 'CANCELLED') continue;
    const start = parseMaybeDate(s?.startAt);
    const end = parseMaybeDate(s?.endAt);
    if (!start || !end) continue;
    const startMs = start.getTime();
    const endMs = end.getTime();
    const promptStartMs = startMs - (5 * 60 * 1000);
    if (now >= promptStartMs && now <= endMs) {
      candidates.push({ ...s, _startMs: startMs });
    }
  }
  candidates.sort((a, b) => Number(a._startMs || 0) - Number(b._startMs || 0));
  return candidates[0] || null;
});

const joinPromptSessionLabel = computed(() => {
  const s = joinPromptSession.value;
  if (!s) return '';
  const who = String(s.counterpartyName || '').trim() || 'Session';
  const st = parseMaybeDate(s.startAt);
  const startLabel = st ? st.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  return `${who}${startLabel ? ` at ${startLabel}` : ''}`;
});

const dismissJoinPromptForSession = (sessionId) => {
  const sid = Number(sessionId || 0);
  if (!sid) return;
  const next = new Set((dismissedJoinPromptSessionIds.value || []).map((n) => Number(n || 0)).filter((n) => n > 0));
  next.add(sid);
  dismissedJoinPromptSessionIds.value = Array.from(next.values());
};

const joinPromptSessionNow = async () => {
  if (!joinPromptSession.value) return;
  await startTrackedSupvMeetForSession(joinPromptSession.value);
};

const supvOptions = computed(() => {
  const list = supervisionSessionsInCell(supvDayLabel.value, supvStartHour.value);
  return list.map((ev) => {
    const who = String(ev.counterpartyName || '').trim() || '—';
    const st = parseMaybeDate(ev.startAt);
    const en = parseMaybeDate(ev.endAt);
    const label = `${who} • ${st ? toDatetimeLocalValue(st).slice(11) : ''}-${en ? toDatetimeLocalValue(en).slice(11) : ''}`;
    return { id: Number(ev.id), label };
  });
});

const selectedSupvSession = computed(() => {
  const list = supervisionSessionsInCell(supvDayLabel.value, supvStartHour.value);
  return list.find((x) => Number(x?.id) === Number(selectedSupvSessionId.value)) || null;
});

/** Day label for display: derive from session startAt when available to avoid timezone/day mismatch. */
const supvDisplayDayLabel = computed(() => {
  const ev = selectedSupvSession.value;
  if (!ev?.startAt) return supvDayLabel.value;
  const d = parseMaybeDate(ev.startAt);
  if (!d) return supvDayLabel.value;
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return dayNames[d.getDay()] || supvDayLabel.value;
});

const canManagePresenterStatus = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  const privileged = ['super_admin', 'superadmin', 'admin', 'support', 'staff', 'clinical_practice_assistant'].includes(role);
  const isSessionSupervisor = String(selectedSupvSession.value?.role || '') === 'supervisor';
  return privileged || isSessionSupervisor || isAdminMode.value;
});

const loadSupvPresenters = async (sessionId) => {
  const sid = Number(sessionId || 0);
  if (!sid) {
    supvPresenters.value = [];
    supvPresentersError.value = '';
    return;
  }
  try {
    supvPresentersLoading.value = true;
    supvPresentersError.value = '';
    const resp = await api.get(`/supervision/sessions/${sid}/presenters`);
    supvPresenters.value = Array.isArray(resp.data?.presenters) ? resp.data.presenters : [];
  } catch (e) {
    supvPresenters.value = [];
    supvPresentersError.value = e.response?.data?.error?.message || e.message || 'Failed to load presenters';
  } finally {
    supvPresentersLoading.value = false;
  }
};

const loadSupvArtifact = async (sessionId) => {
  const sid = Number(sessionId || 0);
  if (!sid) {
    supvTranscriptUrl.value = '';
    supvTranscriptText.value = '';
    supvSummaryText.value = '';
    supvArtifactError.value = '';
    return;
  }
  try {
    supvArtifactLoading.value = true;
    supvArtifactError.value = '';
    const resp = await api.get(`/supervision/sessions/${sid}/artifacts`);
    const artifact = resp?.data?.artifact || null;
    supvTranscriptUrl.value = String(artifact?.transcript_url || '');
    supvTranscriptText.value = String(artifact?.transcript_text || '');
    supvSummaryText.value = String(artifact?.summary_text || '');
  } catch (e) {
    supvArtifactError.value = e.response?.data?.error?.message || e.message || 'Failed to load transcript/summary';
  } finally {
    supvArtifactLoading.value = false;
  }
};

const saveSupvArtifact = async ({ autoSummarize = false } = {}) => {
  const sid = Number(selectedSupvSessionId.value || 0);
  if (!sid) return;
  try {
    supvArtifactSaving.value = true;
    supvArtifactError.value = '';
    const resp = await api.post(`/supervision/sessions/${sid}/artifacts`, {
      transcriptUrl: supvTranscriptUrl.value || null,
      transcriptText: supvTranscriptText.value || null,
      summaryText: autoSummarize ? undefined : (supvSummaryText.value || null),
      autoSummarize
    });
    const artifact = resp?.data?.artifact || null;
    supvTranscriptUrl.value = String(artifact?.transcript_url || '');
    supvTranscriptText.value = String(artifact?.transcript_text || '');
    supvSummaryText.value = String(artifact?.summary_text || '');
  } catch (e) {
    supvArtifactError.value = e.response?.data?.error?.message || e.message || 'Failed to save transcript/summary';
  } finally {
    supvArtifactSaving.value = false;
  }
};

const openSupvModal = (dayName, hour) => {
  const hits = supervisionSessionsInCell(dayName, hour);
  if (!hits.length) return;
  showSupvModal.value = true;
  supvModalError.value = '';
  supvSaving.value = false;
  supvDayLabel.value = String(dayName);
  supvStartHour.value = Number(hour);
  supvEndHour.value = Number(hour) + 1;

  const first = hits[0];
  selectedSupvSessionId.value = Number(first.id || 0);
  supvStartIsoLocal.value = toDatetimeLocalValue(parseMaybeDate(first.startAt));
  supvEndIsoLocal.value = toDatetimeLocalValue(parseMaybeDate(first.endAt));
  supvNotes.value = String(first.notes || '');
  supvCreateMeetLink.value = false;
  void loadSupvPresenters(selectedSupvSessionId.value);
  void loadSupvArtifact(selectedSupvSessionId.value);
};

const closeSupvModal = () => {
  if (showSupvMeetTrackerModal.value) {
    void endTrackedSupvMeet();
  }
  showSupvModal.value = false;
  supvModalError.value = '';
  selectedSupvSessionId.value = 0;
  supvStartIsoLocal.value = '';
  supvEndIsoLocal.value = '';
  supvNotes.value = '';
  supvCreateMeetLink.value = false;
  supvPresenters.value = [];
  supvPresentersLoading.value = false;
  supvPresentersError.value = '';
  supvMeetTrackerError.value = '';
  supvArtifactLoading.value = false;
  supvArtifactSaving.value = false;
  supvArtifactError.value = '';
  supvTranscriptUrl.value = '';
  supvTranscriptText.value = '';
  supvSummaryText.value = '';
};

watch(selectedSupvSessionId, (id) => {
  if (!id) return;
  const ev = selectedSupvSession.value;
  if (!ev) return;
  supvNotes.value = String(ev.notes || '');
  supvStartIsoLocal.value = toDatetimeLocalValue(parseMaybeDate(ev.startAt));
  supvEndIsoLocal.value = toDatetimeLocalValue(parseMaybeDate(ev.endAt));
  void loadSupvPresenters(id);
  void loadSupvArtifact(id);
});

const togglePresenterPresented = async (presenter) => {
  const sid = Number(selectedSupvSessionId.value || 0);
  const uid = Number(presenter?.user_id || 0);
  if (!sid || !uid) return;
  try {
    supvSaving.value = true;
    supvModalError.value = '';
    const currentlyPresented = String(presenter?.status || '').toLowerCase() === 'presented';
    await api.post(`/supervision/sessions/${sid}/presenters/${uid}/presented`, {
      presented: !currentlyPresented
    });
    await loadSupvPresenters(sid);
  } catch (e) {
    supvModalError.value = e.response?.data?.error?.message || e.message || 'Failed to update presenter status';
  } finally {
    supvSaving.value = false;
  }
};

const saveSupvSession = async ({ closeScheduleShell = false } = {}) => {
  const id = Number(selectedSupvSessionId.value || 0);
  if (!id) return;
  try {
    supvSaving.value = true;
    supvModalError.value = '';
    const startAt = supvStartIsoLocal.value ? `${supvStartIsoLocal.value}:00` : '';
    const endAt = supvEndIsoLocal.value ? `${supvEndIsoLocal.value}:00` : '';
    if (!startAt || !endAt) throw new Error('Start and end are required.');
    await api.patch(`/supervision/sessions/${id}`, {
      startAt,
      endAt,
      notes: supvNotes.value || ''
    });
    await load();
    closeSupvModal();
    if (closeScheduleShell) requestCloseModal();
  } catch (e) {
    supvModalError.value = e.response?.data?.error?.message || e.message || 'Failed to save session';
  } finally {
    supvSaving.value = false;
  }
};

const saveSupvSessionFromScheduleModal = () => saveSupvSession({ closeScheduleShell: true });

const ensureSupvMeetLink = async () => {
  const id = Number(selectedSupvSessionId.value || 0);
  if (!id) return;
  try {
    supvSaving.value = true;
    supvModalError.value = '';
    await api.patch(`/supervision/sessions/${id}`, {
      createMeetLink: true
    });
    await load();
  } catch (e) {
    supvModalError.value = e.response?.data?.error?.message || e.message || 'Failed to create meet link';
  } finally {
    supvSaving.value = false;
  }
};

const cancelSupvSession = async () => {
  const id = Number(selectedSupvSessionId.value || 0);
  if (!id) return;
  try {
    supvSaving.value = true;
    supvModalError.value = '';
    await api.post(`/supervision/sessions/${id}/cancel`);
    invalidateScheduleSummaryCacheForUser(props.userId);
    await load({ forceRefresh: true });
    closeSupvModal();
    if (isSupervisionEditMode.value) requestCloseModal();
  } catch (e) {
    supvModalError.value = e.response?.data?.error?.message || e.message || 'Failed to cancel session';
  } finally {
    supvSaving.value = false;
  }
};

const peerActivityModal = ref(null);

const openPeerActivityModal = (block, dayName, hour, minute = 0) => {
  const uid = Number(block?.peerUserId || 0);
  if (!uid) return;
  const activities = Array.isArray(block?.peerActivities) ? block.peerActivities : [];
  peerActivityModal.value = {
    userId: uid,
    label: peerLabelById(uid),
    dayName,
    hour,
    minute,
    color: peerColorById(uid),
    agencyId: Number(block?.agencyId || 0) || null,
    activities,
    canManage: !!canManagePeerCalendar.value
  };
};

const closePeerActivityModal = () => {
  peerActivityModal.value = null;
};

const openPeerStaffSchedule = () => {
  const uid = Number(peerActivityModal.value?.userId || 0);
  if (!uid) return;
  const base = staffSchedulesCompareTo.value;
  router.push({ path: base, query: { userId: String(uid) } });
  closePeerActivityModal();
};

const onCellBlockClick = (e, block, dayName, hour, minute = 0) => {
  const kind = String(block?.kind || '');
  e?.preventDefault?.();
  e?.stopPropagation?.();
  if (kind === 'peerbusy') {
    openPeerActivityModal(block, dayName, hour, minute);
    return;
  }
  if (block?.peerOnly) return;
  if (kind === 'ebusy') {
    const stackDetails = buildStackDetailsForBlock(block, dayName, hour, minute);
    if (stackDetails) openStackDetailsModal(stackDetails);
    return;
  }
  if (kind === 'portal') {
    openSlotActionModal({
      dayName,
      hour,
      preserveSelectionRange: false,
      initialRequestType: 'portal_intake',
      actionSource: 'other_block'
    });
    return;
  }
  const dateYmd = addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dayName));
  const officeId = ['oa', 'ot', 'ob', 'intake-ip', 'intake-vi'].includes(String(block?.kind || ''))
    ? Number(block?.buildingId || selectedOfficeLocationId.value || 0) || null
    : null;
  const roomIdFilter = ['oa', 'ot', 'ob', 'intake-ip', 'intake-vi'].includes(String(block?.kind || ''))
    ? Number(block?.roomId || 0) || null
    : null;
  const officeTop = officeTopEvent(dayName, hour, officeId, roomIdFilter, minute) || null;
  const roomId = Number(officeTop?.roomId || block?.buildingId || block?.roomId || 0) || 0;
  selectedActionSlots.value = [{
    key: actionSlotKey({ dateYmd, hour, roomId }),
    dateYmd,
    dayName: String(dayName),
    hour: Number(hour),
    roomId,
    slot: null
  }];
  lastSelectedActionKey.value = selectedActionSlots.value[0]?.key || '';
  const stackDetails = buildStackDetailsForBlock(block, dayName, hour, minute);
  if (stackDetails) {
    const focusEventId = kind === 'sevt' ? Number(block?.eventId || 0) : 0;
    openStackDetailsModal({
      ...stackDetails,
      autoEdit: focusEventId > 0,
      focusEventId
    });
    return;
  }
  if (kind === 'sevt') {
    const bid = Number(block?.eventId || 0);
    const bKind = String(block?.eventKind || '').trim().toUpperCase();
    const events = scheduleEventsInCell(dayName, hour, minute);
    let targetEvent = null;
    if (bid > 0 && bKind) {
      targetEvent = events.find(
        (ev) => Number(ev?.id || 0) === bid && String(ev?.kind || '').trim().toUpperCase() === bKind
      );
    }
    if (!targetEvent) {
      targetEvent = bid > 0 ? events.find((ev) => Number(ev?.id || 0) === bid) : events[0];
    }
    if (!targetEvent) {
      return;
    }
    const targetKind = String(targetEvent?.kind || '').trim().toUpperCase();
    const stackItem = buildScheduleStackItemFromEvent(targetEvent, {
      id: `sevt-single-${targetKind}-${Number(targetEvent?.id || 0) || Date.now()}`,
      appJoinUrl: String(block?.appJoinUrl || targetEvent?.appJoinUrl || '').trim() || '',
      providerId: resolveBookedProviderIdForEvent(targetEvent)
    });
    void openAppointmentEditInScheduleModal({
      item: stackItem,
      items: [stackItem],
      dayName,
      hour,
      minute,
      focusEventId: Number(stackItem.eventId || 0)
    });
    return;
  }
  if (kind === 'gevt') {
    const events = googleEventsInCell(dayName, hour, minute);
    const ev = events.find((e) => block?.key === `gevt-${String(e?.id || e?.summary || '')}` || e?.htmlLink === block?.link) || events[0];
    if (ev) {
      openGoogleEventModal(ev);
    } else {
      const link = String(block?.link || '').trim();
      if (link) window.open(link, '_blank', 'noreferrer');
    }
    return;
  }
  if (kind === 'supv') {
    openSupervisionEditInScheduleModal(dayName, hour);
    return;
  }
  if (['oa', 'ot', 'ob', 'intake-ip', 'intake-vi'].includes(kind)) {
    const officeLocationId = Number(officeTop?.buildingId || 0);
    if (officeLocationId > 0 && Number(selectedOfficeLocationId.value || 0) !== officeLocationId) {
      selectedOfficeLocationId.value = officeLocationId;
    }
    // Same schedule modal for every office block — chooser first; permissions filter cards.
    openSlotActionModal({
      dayName,
      hour,
      roomId: Number(officeTop?.roomId || 0) || 0,
      dateYmd: addDaysYmd(weekStart.value, dayIdxFromWeekStartMonday(dayName)),
      slot: officeTop,
      preserveSelectionRange: false,
      initialRequestType: '',
      actionSource: 'office_block'
    });
    return;
  }
  if (kind === 'school') {
    openSlotActionModal({
      dayName,
      hour,
      preserveSelectionRange: false,
      initialRequestType: 'school',
      actionSource: 'other_block'
    });
    return;
  }
  if (kind === 'request') {
    openSlotActionModal({
      dayName,
      hour,
      preserveSelectionRange: false,
      initialRequestType: 'office_request_only',
      actionSource: 'other_block'
    });
  }
};

const gevtClickTimer = ref(null);
const clearGevtClickTimer = () => {
  if (gevtClickTimer.value) {
    clearTimeout(gevtClickTimer.value);
    gevtClickTimer.value = null;
  }
};

const showStackDetailsModal = ref(false);
const stackDetailsTitle = ref('');
const stackDetailsItems = ref([]);
const stackDetailsDayName = ref('');
const stackDetailsHour = ref(0);
const stackDetailsMinute = ref(0);
const kioskPinRevealedByItemId = ref({});

function revealKioskPin(itemId) {
  const key = String(itemId || '').trim();
  if (!key) return;
  kioskPinRevealedByItemId.value = { ...kioskPinRevealedByItemId.value, [key]: true };
}
const deletingScheduleEventId = ref(0);
const deletingScheduleEventScope = ref('');
const scheduleEventEditId = ref(0);
const scheduleEventSaving = ref(false);
const scheduleEventEditError = ref('');
const scheduleEventEditForm = ref({
  title: '',
  description: '',
  startAt: '',
  endAt: '',
  agencyId: 0,
  clientId: 0,
  isPrivate: false
});

const EDITABLE_SCHEDULE_EVENT_KINDS = new Set([
  'PERSONAL_EVENT',
  'SCHEDULE_HOLD',
  'INDIRECT_SERVICES',
  'TEAM_MEETING',
  'HUDDLE'
]);
const MEETING_SCHEDULE_EVENT_KINDS = new Set(['TEAM_MEETING', 'HUDDLE']);

const isMeetingStackItem = (item) => MEETING_SCHEDULE_EVENT_KINDS.has(String(item?.eventKind || '').trim().toUpperCase());

function parseClientIdFromScheduleEvent(evOrItem) {
  const fromField = Number(evOrItem?.clientId || 0);
  if (fromField > 0) return fromField;
  const desc = String(evOrItem?.description || '').trim();
  const m = /Client\s*id:\s*(\d+)/i.exec(desc);
  return m ? Number(m[1]) : 0;
}

/** True when a PERSONAL_EVENT row is actually a client session (not a personal time block). */
function isClientSessionScheduleEvent(ev = null) {
  if (!ev) return false;
  const kind = String(ev?.kind || ev?.eventKind || '').trim().toUpperCase();
  if (kind && kind !== 'PERSONAL_EVENT') return false;
  if (Number(ev?.clientId || 0) > 0) return true;
  if (parseClientIdFromScheduleEvent(ev) > 0) return true;
  const title = String(ev?.title || ev?.label || '').trim().toLowerCase();
  if (title.startsWith('virtual session')) return true;
  const desc = String(ev?.description || '').trim().toLowerCase();
  if (desc.includes('client id:') || desc.includes('platform counseling')) return true;
  return false;
}

const scheduleEventClientDisplayName = (clientId) => {
  const id = Number(clientId || 0);
  if (!id) return '';
  const row = (virtualSessionClients.value || []).find((c) => Number(c?.id || 0) === id);
  return String(row?.displayName || row?.fullName || '').trim() || `Client #${id}`;
};

const scheduleEventEditClientOptions = computed(() => {
  const rows = Array.isArray(virtualSessionClients.value) ? [...virtualSessionClients.value] : [];
  const selectedId = Number(scheduleEventEditForm.value.clientId || 0);
  if (selectedId > 0 && !rows.some((c) => Number(c?.id || 0) === selectedId)) {
    rows.unshift({ id: selectedId, displayName: `Client #${selectedId}` });
  }
  return rows;
});

const isEditableScheduleStackItem = (item) => {
  const kind = String(item?.eventKind || '').trim().toUpperCase();
  if (!EDITABLE_SCHEDULE_EVENT_KINDS.has(kind)) return false;
  if (item?.canEdit === false) return false;
  return Number(item?.eventId || 0) > 0;
};

const beginEditScheduleStackItem = async (item) => {
  const eid = Number(item?.eventId || 0);
  if (!eid) return;
  scheduleEventEditError.value = '';
  scheduleEventEditId.value = eid;
  const agencyId = Number(item?.agencyId || 0) || 0;
  const clientId = parseClientIdFromScheduleEvent(item);
  scheduleEventEditForm.value = {
    title: String(item?.label || '').trim(),
    description: String(item?.description || '').trim(),
    startAt: toDatetimeLocalValue(item?.startAt),
    endAt: toDatetimeLocalValue(item?.endAt),
    agencyId,
    clientId,
    isPrivate: !!item?.isPrivate
  };
  // Load pickers in the background — never block the edit shell on network.
  if (isMeetingStackItem(item)) {
    selectedMeetingParticipantIds.value = Array.isArray(item?.attendeeUserIds)
      ? item.attendeeUserIds.map((n) => Number(n)).filter((n) => n > 0)
      : [];
    meetingParticipantSearch.value = '';
    if (agencyId > 0) void loadMeetingCandidates();
  } else if (agencyId > 0) {
    void loadVirtualSessionClients(agencyId);
  }
};

const onScheduleEventEditAgencyChange = () => {
  const agencyId = Number(scheduleEventEditForm.value.agencyId || 0);
  const editingItem = (stackDetailsItems.value || []).find(
    (it) => Number(it?.eventId || 0) === Number(scheduleEventEditId.value || 0)
  );
  if (isMeetingStackItem(editingItem)) {
    if (agencyId > 0) void loadMeetingCandidates();
    return;
  }
  if (agencyId > 0) void loadVirtualSessionClients(agencyId);
};

const cancelEditScheduleStackItem = () => {
  scheduleEventEditId.value = 0;
  scheduleEventEditError.value = '';
};

const saveScheduleStackItem = async (item) => {
  const eid = Number(item?.eventId || 0);
  const uid = Number(props.userId || authStore.user?.id || 0);
  if (!eid || !uid) return;
  let title = String(scheduleEventEditForm.value.title || '').trim();
  if (!title) {
    scheduleEventEditError.value = 'Title is required.';
    return;
  }
  const startAt = String(scheduleEventEditForm.value.startAt || '').trim();
  const endAt = String(scheduleEventEditForm.value.endAt || '').trim();
  if (!startAt || !endAt) {
    scheduleEventEditError.value = 'Start and end times are required.';
    return;
  }
  const isMeeting = isMeetingStackItem(item);
  if (isMeeting && selectedMeetingParticipantIdSet.value.size === 0) {
    scheduleEventEditError.value = 'Add at least one coworker before saving.';
    return;
  }
  const clientId = isMeeting ? null : (Number(scheduleEventEditForm.value.clientId || 0) || null);
  let description = String(scheduleEventEditForm.value.description || '').trim();
  if (!isMeeting && clientId) {
    if (/Client\s*id:\s*\d+/i.test(description)) {
      description = description.replace(/Client\s*id:\s*\d+/i, `Client id: ${clientId}`);
    } else {
      description = [description, `Client id: ${clientId}`].filter(Boolean).join('\n\n');
    }
    if (/^Virtual session/i.test(title)) {
      title = `Virtual session · ${scheduleEventClientDisplayName(clientId)}`;
    }
  }
  try {
    scheduleEventSaving.value = true;
    scheduleEventEditError.value = '';
    await api.patch(`/users/${uid}/schedule-events/${eid}`, {
      title,
      description,
      startAt: startAt.length === 16 ? `${startAt}:00` : startAt,
      endAt: endAt.length === 16 ? `${endAt}:00` : endAt,
      agencyId: Number(scheduleEventEditForm.value.agencyId || 0) || null,
      isPrivate: !!scheduleEventEditForm.value.isPrivate,
      allDay: false,
      clientId,
      ...(isMeeting ? { attendeeUserIds: Array.from(selectedMeetingParticipantIdSet.value) } : {})
    });
    scheduleEventEditId.value = 0;
    invalidateScheduleSummaryCacheForUser(props.userId);
    await load({ forceRefresh: true });
    // Keep picker open when multiple events share the slot so another can be edited.
    if (stackDetailsItems.value.length > 1 && stackDetailsDayName.value) {
      const refreshed = scheduleEventsInCell(
        stackDetailsDayName.value,
        Number(stackDetailsHour.value || 0),
        Number(stackDetailsMinute.value || 0)
      );
      if (refreshed.length > 1) {
        stackDetailsItems.value = refreshed.map((ev, idx) => buildScheduleStackItemFromEvent(ev, {
          id: `sevt-${String(ev?.kind || 'evt').toUpperCase()}-${String(ev?.id || ev?.googleEventId || idx)}`
        }));
        requestType.value = 'pick_schedule_event';
      } else {
        closeStackDetailsModal();
        requestCloseModal();
      }
    } else {
      closeStackDetailsModal();
      requestCloseModal();
    }
  } catch (e) {
    scheduleEventEditError.value = e?.response?.data?.error?.message || e?.message || 'Failed to save changes';
  } finally {
    scheduleEventSaving.value = false;
  }
};
const teamMeetingActivityExpandedById = ref({});
const teamMeetingActivityById = ref({});
const teamMeetingActivityLoadingById = ref({});
const teamMeetingActivityErrorById = ref({});
const requestCloseStackDetailsModal = () => {
  if (scheduleEventEditId.value > 0 && !scheduleEventSaving.value) {
    const ok = window.confirm('Discard unsaved edits for this event?');
    if (!ok) return;
  }
  closeStackDetailsModal();
};

const closeStackDetailsModal = () => {
  showStackDetailsModal.value = false;
  stackDetailsTitle.value = '';
  stackDetailsItems.value = [];
  stackDetailsDayName.value = '';
  stackDetailsHour.value = 0;
  stackDetailsMinute.value = 0;
  kioskPinRevealedByItemId.value = {};
  teamMeetingActivityExpandedById.value = {};
  scheduleEventEditId.value = 0;
  scheduleEventEditError.value = '';
  scheduleEventSaving.value = false;
};
const formatActivityTime = (createdAt) => {
  if (!createdAt) return '';
  try {
    const d = new Date(createdAt);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
};
async function toggleTeamMeetingActivity(eventId) {
  const eid = Number(eventId || 0);
  if (!eid) return;
  const expanded = !teamMeetingActivityExpandedById.value[eid];
  teamMeetingActivityExpandedById.value = { ...teamMeetingActivityExpandedById.value, [eid]: expanded };
  if (!expanded) return;
  if (teamMeetingActivityById.value[eid]?.length) return;
  teamMeetingActivityLoadingById.value = { ...teamMeetingActivityLoadingById.value, [eid]: true };
  teamMeetingActivityErrorById.value = { ...teamMeetingActivityErrorById.value, [eid]: '' };
  try {
    const resp = await api.get(`/team-meetings/${eid}/activity`);
    teamMeetingActivityById.value = { ...teamMeetingActivityById.value, [eid]: resp?.data?.activity || [] };
  } catch (err) {
    teamMeetingActivityErrorById.value = { ...teamMeetingActivityErrorById.value, [eid]: err?.response?.data?.error?.message || 'Failed to load chat & Q&A.' };
    teamMeetingActivityById.value = { ...teamMeetingActivityById.value, [eid]: [] };
  } finally {
    teamMeetingActivityLoadingById.value = { ...teamMeetingActivityLoadingById.value, [eid]: false };
  }
}
const resolveBookedProviderIdForEvent = (evOrItem = null) => {
  const fromEvent = Number(
    evOrItem?.providerId
    || evOrItem?.provider_id
    || evOrItem?.bookedProviderId
    || evOrItem?.assignedProviderId
    || 0
  );
  if (fromEvent > 0) return fromEvent;
  return Number(props.userId || authStore.user?.id || 0) || 0;
};

let appointmentEditOpenGen = 0;

const openAppointmentEditInScheduleModal = async ({
  item = null,
  items = [],
  dayName = '',
  hour = 0,
  minute = 0,
  focusEventId = 0
} = {}) => {
  const gen = ++appointmentEditOpenGen;
  const list = Array.isArray(items) && items.length
    ? items
    : (item ? [item] : []);
  if (!list.length) return;

  showStackDetailsModal.value = false;
  showSupvModal.value = false;
  stackDetailsItems.value = list;
  stackDetailsDayName.value = String(dayName || '').trim();
  stackDetailsHour.value = Number(hour || 0);
  stackDetailsMinute.value = Number(minute || 0);
  stackDetailsTitle.value = '';
  scheduleEventEditError.value = '';
  modalError.value = '';

  const providerId = resolveBookedProviderIdForEvent(item || list[0]);
  if (providerId > 0) bookingTargetUserId.value = providerId;

  modalDay.value = String(dayName || modalDay.value || 'Monday');
  modalHour.value = Number(hour || 0);
  modalStartHour.value = Number(hour || 0);
  modalEndHour.value = Number(hour || 0) + 1;
  modalStartMinute.value = Number(minute || 0);
  modalEndMinute.value = 0;

  const focusId = Number(focusEventId || item?.eventId || 0);
  const editableCount = list.filter((it) => isEditableScheduleStackItem(it)).length;

  if (list.length > 1 && editableCount > 1 && !focusId) {
    // Set mode before showing so the office chooser never flashes.
    requestType.value = 'pick_schedule_event';
    scheduleEventEditId.value = 0;
    showRequestModal.value = true;
    return;
  }

  const target = list.find((it) => focusId > 0 && Number(it?.eventId || 0) === focusId)
    || list.find((it) => isEditableScheduleStackItem(it))
    || list[0];

  if (!isEditableScheduleStackItem(target)) {
    // Non-editable items (e.g. program events) stay on the legacy details surface.
    openStackDetailsModal({
      title: `${scheduleKindLabel(target?.eventKind, target)} — ${dayName} ${hourLabel(hour)}`,
      items: list,
      dayName,
      hour,
      minute,
      autoEdit: false,
      forceLegacy: true
    });
    showRequestModal.value = false;
    return;
  }

  const agencyId = Number(target?.agencyId || 0);
  if (agencyId > 0) selectedActionAgencyId.value = agencyId;
  // Mode first, then open — avoids empty requestType → office action chooser.
  requestType.value = 'edit_schedule_event';
  showRequestModal.value = true;
  void loadBookingMetadataForProvider();
  await beginEditScheduleStackItem(target);
  if (gen !== appointmentEditOpenGen || !showRequestModal.value) return;
};

const pickScheduleEventForEdit = async (item) => {
  if (!item) return;
  if (!isEditableScheduleStackItem(item)) {
    openStackDetailsModal({
      title: String(item.kindLabel || 'Details'),
      items: [item],
      dayName: stackDetailsDayName.value,
      hour: stackDetailsHour.value,
      minute: stackDetailsMinute.value,
      autoEdit: false,
      forceLegacy: true
    });
    showRequestModal.value = false;
    return;
  }
  const agencyId = Number(item?.agencyId || 0);
  if (agencyId > 0) selectedActionAgencyId.value = agencyId;
  const providerId = resolveBookedProviderIdForEvent(item);
  if (providerId > 0) bookingTargetUserId.value = providerId;
  await beginEditScheduleStackItem(item);
  requestType.value = 'edit_schedule_event';
};

const openSupervisionEditInScheduleModal = (dayName, hour) => {
  const hits = supervisionSessionsInCell(dayName, hour);
  if (!hits.length) return;
  showStackDetailsModal.value = false;
  showSupvModal.value = false;
  supvModalError.value = '';
  supvSaving.value = false;
  supvDayLabel.value = String(dayName);
  supvStartHour.value = Number(hour);
  supvEndHour.value = Number(hour) + 1;
  const first = hits[0];
  selectedSupvSessionId.value = Number(first.id || 0);
  supvStartIsoLocal.value = toDatetimeLocalValue(parseMaybeDate(first.startAt));
  supvEndIsoLocal.value = toDatetimeLocalValue(parseMaybeDate(first.endAt));
  supvNotes.value = String(first.notes || '');
  supvCreateMeetLink.value = false;

  const providerId = Number(
    first?.providerId
    || first?.provider_id
    || first?.supervisorId
    || props.userId
    || authStore.user?.id
    || 0
  );
  if (providerId > 0) bookingTargetUserId.value = providerId;
  modalDay.value = String(dayName || modalDay.value || 'Monday');
  modalHour.value = Number(hour || 0);
  modalStartHour.value = Number(hour || 0);
  modalEndHour.value = Number(hour || 0) + 1;

  requestType.value = 'edit_supervision';
  showRequestModal.value = true;
  void loadSupvPresenters(selectedSupvSessionId.value);
  void loadSupvArtifact(selectedSupvSessionId.value);
  void loadBookingMetadataForProvider();
};

const openStackDetailsModal = ({
  title = '',
  items = [],
  autoEdit = false,
  focusEventId = 0,
  dayName = '',
  hour = 0,
  minute = 0,
  forceLegacy = false
} = {}) => {
  const list = Array.isArray(items) ? items : [];
  const editable = list.filter((it) => isEditableScheduleStackItem(it));
  // Editable appointments always use the shared Schedule shell.
  if (!forceLegacy && editable.length > 0) {
    void openAppointmentEditInScheduleModal({
      items: list,
      dayName,
      hour,
      minute,
      focusEventId,
      item: editable.find((it) => Number(it?.eventId || 0) === Number(focusEventId || 0)) || editable[0]
    });
    return;
  }

  stackDetailsTitle.value = String(title || '').trim() || 'Overlapping items';
  stackDetailsItems.value = list;
  stackDetailsDayName.value = String(dayName || '').trim();
  stackDetailsHour.value = Number(hour || 0);
  stackDetailsMinute.value = Number(minute || 0);
  scheduleEventEditId.value = 0;
  scheduleEventEditError.value = '';
  showStackDetailsModal.value = true;
};

const deleteScheduleMeeting = async (item, scope = 'single') => {
  const eventId = Number(item?.eventId || 0);
  if (!eventId) return;
  const normalizedScope = scope === 'future' ? 'future' : 'single';
  const title = String(item?.label || 'this session').trim();
  const confirmMsg = normalizedScope === 'future'
    ? `Delete "${title}" and all future occurrences in this series?`
    : `Delete "${title}"?`;
  if (!window.confirm(confirmMsg)) return;
  const uid = Number(props.userId || authStore.user?.id || 0);
  if (!uid) {
    modalError.value = 'Unable to resolve provider user for delete.';
    return;
  }
  try {
    deletingScheduleEventId.value = eventId;
    deletingScheduleEventScope.value = normalizedScope;
    await api.delete(`/users/${uid}/schedule-events/${eventId}`, {
      params: { scope: normalizedScope }
    });
    invalidateScheduleSummaryCacheForUser(props.userId);
    await load({ forceRefresh: true });
    closeStackDetailsModal();
  } catch (e) {
    modalError.value = e?.response?.data?.error?.message || e?.message || 'Failed to delete meeting';
  } finally {
    deletingScheduleEventId.value = 0;
    deletingScheduleEventScope.value = '';
  }
};
const deleteScheduleMeetingOccurrence = async (item) => deleteScheduleMeeting(item, 'single');
const deleteScheduleMeetingFuture = async (item) => deleteScheduleMeeting(item, 'future');

const showGoogleEventModal = ref(false);
const selectedGoogleEvent = ref(null);
const googleEventEditMode = ref(false);
const googleEventFetching = ref(false);
const googleEventSaving = ref(false);
const googleEventSaveError = ref('');
const googleEventEditForm = ref({
  summary: '',
  description: '',
  location: '',
  startAt: '',
  endAt: ''
});

const canEditGoogleEvent = computed(() => {
  const uid = Number(authStore.user?.id || 0);
  const targetId = Number(props.userId || 0);
  return uid > 0 && targetId > 0 && uid === targetId;
});

const linkedScheduleEventForGoogleModal = computed(() => {
  const eventId = String(selectedGoogleEvent.value?.id || '').trim();
  if (!eventId) return null;
  const rows = Array.isArray(summary.value?.scheduleEvents) ? summary.value.scheduleEvents : [];
  const match = rows.find((row) => String(row?.googleEventId || '').trim() === eventId);
  if (!match) return null;
  const kind = String(match?.kind || '').trim().toUpperCase();
  if (!['TEAM_MEETING', 'HUDDLE'].includes(kind)) return null;
  const appJoinUrl = String(match?.appJoinUrl || '').trim();
  if (!appJoinUrl) return null;
  return { appJoinUrl, kind };
});

const closeGoogleEventModal = () => {
  showGoogleEventModal.value = false;
  selectedGoogleEvent.value = null;
  googleEventEditMode.value = false;
  googleEventFetching.value = false;
  googleEventSaving.value = false;
  googleEventSaveError.value = '';
};

const openGoogleEventModal = (ev) => {
  if (!ev) return;
  selectedGoogleEvent.value = ev;
  googleEventEditMode.value = false;
  googleEventFetching.value = false;
  googleEventSaveError.value = '';
  showGoogleEventModal.value = true;
};

const openGoogleEventInPopup = (ev) => {
  const link = String(ev?.htmlLink || '').trim();
  if (!link) return;
  const popup = window.open(link, '_blank', 'noopener,noreferrer,width=900,height=700');
  if (!popup) {
    window.open(link, '_blank', 'noreferrer');
  }
};

const openMeetInPopup = (meetLink) => {
  const link = String(meetLink || '').trim();
  if (!link) return;
  const popup = window.open(link, '_blank', 'noopener,noreferrer,width=1200,height=850');
  if (!popup) {
    window.open(link, '_blank', 'noreferrer');
  }
};

const startEditGoogleEvent = async () => {
  const ev = selectedGoogleEvent.value;
  const uid = Number(props.userId || 0);
  const eventId = String(ev?.id || '').trim();
  if (!ev || !uid || !eventId) return;
  try {
    googleEventFetching.value = true;
    const resp = await api.get(`/users/${uid}/google-events/${encodeURIComponent(eventId)}`);
    const full = resp.data || {};
    selectedGoogleEvent.value = { ...ev, ...full };
    const st = parseMaybeDate(full.startAt || ev.startAt);
    const en = parseMaybeDate(full.endAt || ev.endAt);
    googleEventEditForm.value = {
      summary: String(full.summary || ev.summary || '').trim(),
      description: String(full.description || '').trim(),
      location: String(full.location || '').trim(),
      startAt: st ? toDatetimeLocalValue(st) : '',
      endAt: en ? toDatetimeLocalValue(en) : ''
    };
    googleEventEditMode.value = true;
    googleEventSaveError.value = '';
  } catch (e) {
    googleEventSaveError.value = e?.response?.data?.error?.message || e?.message || 'Failed to load event';
  } finally {
    googleEventFetching.value = false;
  }
};

const cancelEditGoogleEvent = () => {
  googleEventEditMode.value = false;
  googleEventSaveError.value = '';
};

const saveGoogleEvent = async () => {
  const ev = selectedGoogleEvent.value;
  const uid = Number(props.userId || 0);
  const eventId = String(ev?.id || '').trim();
  const form = googleEventEditForm.value;
  if (!ev || !uid || !eventId) return;
  const startAt = form.startAt
    ? (form.startAt.length === 16 ? `${form.startAt}:00` : form.startAt.includes('T') ? form.startAt : `${form.startAt}T00:00:00`)
    : undefined;
  const endAt = form.endAt
    ? (form.endAt.length === 16 ? `${form.endAt}:00` : form.endAt.includes('T') ? form.endAt : `${form.endAt}T00:00:00`)
    : undefined;
  if (startAt && endAt && new Date(endAt).getTime() <= new Date(startAt).getTime()) {
    googleEventSaveError.value = 'End time must be after start time';
    return;
  }
  try {
    googleEventSaving.value = true;
    googleEventSaveError.value = '';
    const payload = {};
    if (form.summary !== undefined) payload.summary = form.summary;
    if (form.description !== undefined) payload.description = form.description;
    if (form.location !== undefined) payload.location = form.location;
    if (startAt) payload.startAt = startAt;
    if (endAt) payload.endAt = endAt;
    const resp = await api.patch(`/users/${uid}/google-events/${encodeURIComponent(eventId)}`, payload);
    const updated = resp.data?.event || resp.data;
    if (updated) {
      selectedGoogleEvent.value = { ...ev, ...updated };
    }
    googleEventEditMode.value = false;
    await load();
  } catch (e) {
    googleEventSaveError.value = e?.response?.data?.error?.message || e?.message || 'Failed to save event';
  } finally {
    googleEventSaving.value = false;
  }
};

const deleteGoogleEvent = async () => {
  const ev = selectedGoogleEvent.value;
  const uid = Number(props.userId || 0);
  const eventId = String(ev?.id || '').trim();
  if (!ev || !uid || !eventId) return;
  if (!confirm('Delete this event from your Google Calendar? This cannot be undone.')) return;
  try {
    googleEventSaving.value = true;
    googleEventSaveError.value = '';
    await api.delete(`/users/${uid}/google-events/${encodeURIComponent(eventId)}`);
    closeGoogleEventModal();
    await load();
  } catch (e) {
    googleEventSaveError.value = e?.response?.data?.error?.message || e?.message || 'Failed to delete event';
  } finally {
    googleEventSaving.value = false;
  }
};

const formatRangeFromRaw = (startAt, endAt) => {
  const st = parseMaybeDate(startAt);
  const en = parseMaybeDate(endAt);
  if (!st || !en) return '';
  const sLabel = st.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const eLabel = en.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${sLabel}-${eLabel}`;
};

const SCHEDULE_EVENT_KIND_LABELS = {
  SKILL_BUILDERS_PROGRAM: 'Skill Builders program',
  COMPANY_EVENT_BOOKING: 'Program event',
  TEAM_MEETING: 'Team meeting',
  HUDDLE: 'Huddle',
  PERSONAL_EVENT: 'Personal',
  HOLD: 'Hold',
  INDIRECT_SERVICES: 'Indirect services',
  AGENCY_MEETING: 'Agency meeting',
  DOCUMENTATION: 'Documentation'
};

const scheduleKindLabel = (kindRaw, ev = null) => {
  const k = String(kindRaw || '').trim().toUpperCase();
  if (k === 'COMPANY_EVENT_BOOKING') {
    const et = String(ev?.eventType || '').trim().toLowerCase();
    if (et.startsWith('school_') || ev?.isSchoolPortalEvent) return 'School event';
  }
  if (k === 'PERSONAL_EVENT' || (!k && isClientSessionScheduleEvent(ev))) {
    if (isClientSessionScheduleEvent(ev || { kind: k })) return 'Session';
    return 'Personal';
  }
  if (SCHEDULE_EVENT_KIND_LABELS[k]) return SCHEDULE_EVENT_KIND_LABELS[k];
  if (!k) return 'Schedule event';
  return k
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

const formatSessionProviderName = (p) => {
  const fn = String(p?.firstName || '').trim();
  const ln = String(p?.lastName || '').trim();
  const full = [fn, ln].filter(Boolean).join(' ');
  if (full) return full;
  const uid = Number(p?.userId || 0);
  return uid > 0 ? `User ${uid}` : 'Unknown';
};

const scheduleEventStackExtras = (ev) => {
  const kind = String(ev?.kind || '').trim().toUpperCase();
  if (kind !== 'COMPANY_EVENT_BOOKING') return {};
  return {
    companyEventId: Number(ev?.companyEventId || 0) || null,
    sessionDateId: Number(ev?.sessionDateId || ev?.id || 0) || null,
    eventType: ev?.eventType ? String(ev.eventType) : null,
    isSchoolPortalEvent: !!ev?.isSchoolPortalEvent,
    schoolName: ev?.schoolName ? String(ev.schoolName).trim() : null,
    kioskEventPinSet: !!ev?.kioskEventPinSet,
    kioskEventPinCode: ev?.kioskEventPinCode ? String(ev.kioskEventPinCode) : null,
    sessionProviders: Array.isArray(ev?.sessionProviders) ? ev.sessionProviders : [],
    eventRosterProviders: Array.isArray(ev?.eventRosterProviders) ? ev.eventRosterProviders : [],
    participantCount: Number(ev?.participantCount || 0),
    participantAges: Array.isArray(ev?.participantAges) ? ev.participantAges : []
  };
};

const formatParticipantAgesSummary = (ages) => {
  const list = (Array.isArray(ages) ? ages : [])
    .map((a) => Number(a))
    .filter((a) => Number.isFinite(a) && a >= 0);
  if (!list.length) return '';
  const uniq = [...new Set(list)].sort((a, b) => a - b);
  if (uniq.length === 1) return `age ${uniq[0]}`;
  const min = uniq[0];
  const max = uniq[uniq.length - 1];
  if (max - min <= 4 && uniq.length <= 8) return `ages ${uniq.join(', ')}`;
  return `ages ${min}–${max}`;
};

const eventCoworkersForItem = (item) => {
  const session = Array.isArray(item?.sessionProviders) ? item.sessionProviders : [];
  const roster = Array.isArray(item?.eventRosterProviders) ? item.eventRosterProviders : [];
  return session.length ? session : roster;
};

const formatCoworkerLine = (p) => {
  const name = formatSessionProviderName(p);
  const myId = Number(authStore.user?.id || props.userId || 0);
  const uid = Number(p?.userId || 0);
  return uid > 0 && myId > 0 && uid === myId ? `${name} (you)` : name;
};

/** Resolve schedule row when numeric ids can collide (e.g. Skill Builders session id vs user schedule_event id). */
const findScheduleEventByIdAndKind = (eventId, eventKind) => {
  const rows = Array.isArray(summary.value?.scheduleEvents) ? summary.value.scheduleEvents : [];
  const eid = Number(eventId || 0);
  if (!eid) return null;
  const k = String(eventKind || '').trim().toUpperCase();
  if (k) {
    const exact = rows.find(
      (e) => Number(e?.id || 0) === eid && String(e?.kind || '').trim().toUpperCase() === k
    );
    if (exact) return exact;
  }
  return rows.find((e) => Number(e?.id || 0) === eid) || null;
};

/** MySQL TIME / "HH:MM:SS" → locale 12h string (matches Skill Builders event portal). */
const formatSkillBuildersProgramWallTime = (t) => {
  if (t == null || t === '') return '';
  const s = String(t).trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return s;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return s;
  const d = new Date(2000, 0, 1, h, mi, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const buildScheduleStackItemFromEvent = (ev, overrides = {}) => {
  const targetKind = String(ev?.kind || '').trim().toUpperCase();
  const clientId = parseClientIdFromScheduleEvent(ev);
  const attendeeUserIds = Array.isArray(ev?.attendeeUserIds)
    ? ev.attendeeUserIds.map((n) => Number(n)).filter((n) => n > 0)
    : [];
  const withClient = { ...ev, kind: targetKind, clientId: clientId || ev?.clientId || null };
  return {
    id: `sevt-${targetKind || 'evt'}-${String(ev?.id || ev?.googleEventId || Date.now())}`,
    label: String(ev?.title || '').trim() || 'Schedule event',
    subLabel: ev?.allDay ? 'All day' : formatRangeFromRaw(ev?.startAt, ev?.endAt),
    kindLabel: scheduleKindLabel(targetKind, withClient),
    detailText: buildScheduleEventDetailText(ev),
    description: String(ev?.description || '').trim() || '',
    agencyId: Number(ev?.agencyId || ev?._agencyId || 0) || null,
    clientId: clientId || null,
    providerId: Number(ev?.providerId || ev?.provider_id || props.userId || 0) || null,
    attendeeUserIds,
    canEdit: ev?.canEdit !== false,
    isPrivate: !!ev?.isPrivate,
    allDay: !!ev?.allDay,
    startAt: ev?.startAt || null,
    endAt: ev?.endAt || null,
    link: String(ev?.htmlLink || '').trim() || '',
    appJoinUrl: String(ev?.appJoinUrl || '').trim() || '',
    meetLink: String(ev?.meetLink || '').trim() || '',
    eventId: Number(ev?.id || 0) || null,
    eventKind: targetKind,
    recurrenceSeriesId: String(ev?.recurrenceSeriesId || '').trim() || '',
    ...scheduleEventStackExtras(ev),
    ...overrides
  };
};

const buildScheduleEventDetailText = (ev) => {
  if (!ev) return '';
  const lines = [];
  const kind = String(ev?.kind || '').trim().toUpperCase();
  const agencyId = Number(ev?.agencyId || ev?._agencyId || 0);
  if (agencyId > 0) {
    lines.push(`Organization: ${agencyLabel(agencyId) || `Agency ${agencyId}`}`);
  } else if (['PERSONAL_EVENT', 'SCHEDULE_HOLD'].includes(kind)) {
    lines.push('Organization: All / none (not tied to one organization)');
  }
  lines.push(`Type: ${scheduleKindLabel(kind, ev)}`);
  const when = ev?.allDay
    ? `All day (${String(ev?.startDate || '').slice(0, 10)} – ${String(ev?.endDate || '').slice(0, 10)})`
    : formatRangeFromRaw(ev?.startAt, ev?.endAt);
  if (when) lines.push(`When: ${when}`);
  const clientId = parseClientIdFromScheduleEvent(ev);
  if (clientId) lines.push(`Client: ${scheduleEventClientDisplayName(clientId)}`);
  const desc = String(ev?.description || '').trim();
  if (desc) lines.push(`Notes:\n${desc}`);
  const rc = String(ev?.reasonCode || '').trim();
  if (rc) lines.push(`Reason code: ${rc}`);
  if (ev?.sessionOfLabel) lines.push(String(ev.sessionOfLabel));
  if (ev?.packageName) lines.push(`Package: ${ev.packageName}`);
  if (ev?.payment?.id) {
    const amt = Number(ev.payment.amountCents || 0);
    const money = `$${(amt / 100).toFixed(amt % 100 === 0 ? 0 : 2)}`;
    lines.push(`Payment: ${money} (${ev.payment.paymentMode || 'attached'})`);
  }
  if (ev?.isPrivate) lines.push('Marked private on your calendar');
  if (ev?.meetLink) lines.push(`Meet link: ${ev.meetLink}`);
  if (ev?.appJoinUrl) lines.push(`Video room: ${ev.appJoinUrl}`);
  const rf = String(ev?.recurrenceFrequency || '').trim();
  if (rf && rf !== 'ONCE') lines.push(`Recurrence: ${rf}`);
  if (kind === 'SKILL_BUILDERS_PROGRAM') {
    const arr = formatSkillBuildersProgramWallTime(ev?.employeeReportTime);
    const dep = formatSkillBuildersProgramWallTime(ev?.employeeDepartureTime);
    if (arr && dep) {
      lines.push(`Staff planned window: ${arr} – ${dep}`);
    } else if (arr) {
      lines.push(`Staff arrival / clock-in: ${arr}`);
    } else if (dep) {
      lines.push(`Staff departure: ${dep}`);
    }
    const assigned = Array.isArray(ev?.assignedSessionProviders) ? ev.assignedSessionProviders : [];
    const roster = Array.isArray(ev?.groupRosterProviders) ? ev.groupRosterProviders : [];
    if (assigned.length) {
      lines.push('Working this session:');
      for (const p of assigned) {
        lines.push(`• ${formatSessionProviderName(p)}`);
      }
    } else if (roster.length) {
      lines.push('Group roster (per-session “who is working” not set yet for this occurrence):');
      for (const p of roster) {
        lines.push(`• ${formatSessionProviderName(p)}`);
      }
    } else {
      lines.push('No providers on this roster or per-session assignment.');
    }
  }
  if (kind === 'COMPANY_EVENT_BOOKING') {
    const statusLabel = String(ev?.assignmentStatusLabel || ev?.assignmentStatus || '').trim();
    if (statusLabel) lines.push(`Assignment: ${statusLabel}`);
    const school = String(ev?.schoolName || '').trim();
    if (school) lines.push(`School: ${school}`);
    const loc = String(ev?.locationLabel || '').trim();
    if (loc && loc !== school) lines.push(`Location: ${loc}`);
    const coworkers = Array.isArray(ev?.sessionProviders) && ev.sessionProviders.length
      ? ev.sessionProviders
      : Array.isArray(ev?.eventRosterProviders)
        ? ev.eventRosterProviders
        : [];
    if (coworkers.length) {
      lines.push('Working this session:');
      for (const p of coworkers) {
        lines.push(`• ${formatCoworkerLine(p)}`);
      }
    }
    const pCount = Number(ev?.participantCount || 0);
    if (pCount > 0) {
      const agePart = formatParticipantAgesSummary(ev?.participantAges);
      lines.push(
        agePart
          ? `${pCount} ${pCount === 1 ? 'participant' : 'participants'} · ${agePart}`
          : `${pCount} ${pCount === 1 ? 'participant' : 'participants'}`
      );
    }
  }
  return lines.join('\n');
};

const stackItemHasAction = (item) => {
  if (!item) return false;
  if (item.googleEvent) return true;
  if (Number(item.sessionId || 0) > 0) return true;
  if (String(item.link || '').trim()) return true;
  if (String(item.appJoinUrl || '').trim()) return true;
  if (String(item.meetLink || '').trim()) return true;
  const eid = Number(item.eventId || 0);
  if (eid > 0) {
    const ev = findScheduleEventByIdAndKind(eid, item.eventKind);
    if (ev) {
      if (String(ev.meetLink || '').trim()) return true;
      if (String(ev.htmlLink || '').trim()) return true;
      if (String(ev.appJoinUrl || '').trim()) return true;
    }
  }
  return false;
};

const stackItemActionLabel = (item) => {
  if (item?.googleEvent) return 'View in calendar';
  if (Number(item?.sessionId || 0) > 0) return 'Open session';
  if (String(item?.appJoinUrl || '').trim()) return 'Join';
  if (String(item?.meetLink || '').trim()) return 'Open meeting link';
  if (String(item?.link || '').trim()) return 'Open link';
  return 'Open';
};

const buildStackDetailsForBlock = (block, dayName, hour, minute = 0) => {
  const kind = String(block?.kind || '');
  if (kind === 'supv') {
    const sessions = supervisionSessionsInCell(dayName, hour, minute);
    if (sessions.length <= 1) return null;
    return {
      title: `Supervision sessions — ${dayName} ${hourLabel(hour)}`,
      items: sessions.map((s) => ({
        id: `supv-${Number(s?.id || 0)}`,
        label: String(s?.counterpartyName || '').trim() || `Session ${Number(s?.id || 0)}`,
        subLabel: formatRangeFromRaw(s?.startAt, s?.endAt),
        sessionId: Number(s?.id || 0),
        dayName,
        hour
      }))
    };
  }
  if (kind === 'school') {
    const names = schoolNamesInCell(dayName, hour);
    if (names.length <= 1) return null;
    return {
      title: `School assignments — ${dayName} ${hourLabel(hour)}`,
      items: names.map((name, idx) => ({
        id: `school-${idx}`,
        label: String(name || '').trim(),
        subLabel: ''
      }))
    };
  }
  if (kind === 'sevt' || kind === 'more') {
    const events = scheduleEventsInCell(dayName, hour, minute);
    const titleText = String(block?.title || '').toLowerCase();
    const isScheduleOverflow = kind === 'sevt' || titleText.includes('schedule event');
    if (!isScheduleOverflow || events.length <= 1) return null;
    return {
      title: `Schedule events — ${dayName} ${hourLabel(hour)}`,
      dayName,
      hour,
      minute,
      items: events.map((ev, idx) => buildScheduleStackItemFromEvent(ev, {
        id: `sevt-${String(ev?.kind || 'evt').toUpperCase()}-${String(ev?.id || ev?.googleEventId || idx)}`
      }))
    };
  }
  if (kind === 'gevt' || kind === 'more') {
    const events = googleEventsInCell(dayName, hour, minute);
    const titleText = String(block?.title || '').toLowerCase();
    const isGoogleOverflow = kind === 'gevt' || titleText.includes('google event');
    if (!isGoogleOverflow || events.length <= 1) return null;
    return {
      title: `Google events — ${dayName} ${hourLabel(hour)}`,
      items: events.map((ev, idx) => ({
        id: `gevt-${String(ev?.id || idx)}`,
        label: String(ev?.summary || '').trim() || 'Google event',
        subLabel: formatRangeFromRaw(ev?.startAt, ev?.endAt),
        link: String(ev?.htmlLink || '').trim() || '',
        googleEvent: ev
      }))
    };
  }
  if (kind === 'ebusy') {
    const timeSuffix = showQuarterDetail.value ? slotClockLabel(dayName, hour, minute) : hourLabel(hour);
    if (!hideExternalIcsTitles.value) {
      const events = externalIcsEventsInCell(dayName, hour, minute);
      if (events.length >= 1) {
        return {
          title: `External calendar busy — ${dayName} ${timeSuffix}`,
          items: events.map((ev, idx) => ({
            id: `eics-${idx}`,
            label: String(ev.summary || '').trim() || ev.calendarLabel || 'Busy',
            subLabel: formatRangeFromRaw(ev.startAt, ev.endAt),
            therapyNoteAid: true,
            therapyStartAt: ev.startAt,
            therapyEndAt: ev.endAt,
            therapySummary: String(ev.summary || '').trim(),
            therapyCalendarLabel: String(ev.calendarLabel || '').trim()
          }))
        };
      }
    }
    const labels = externalBusyLabels(dayName, hour);
    if (!labels.length) return null;
    return {
      title: `Therapy Notes busy sources — ${dayName} ${timeSuffix}`,
      items: labels.map((label, idx) => ({
        id: `ebusy-${idx}`,
        label: String(label || '').trim(),
        subLabel: ''
      }))
    };
  }
  return null;
};

const openStackDetailsItem = (item) => {
  if (item?.googleEvent) {
    closeStackDetailsModal();
    openGoogleEventModal(item.googleEvent);
    return;
  }
  const meetFromItem = String(item?.meetLink || '').trim();
  if (meetFromItem) {
    closeStackDetailsModal();
    window.open(meetFromItem, '_blank', 'noreferrer');
    return;
  }
  const appJoinUrl = String(item?.appJoinUrl || '').trim();
  if (appJoinUrl) {
    closeStackDetailsModal();
    window.location.href = appJoinUrl;
    return;
  }
  const link = String(item?.link || '').trim();
  if (link) {
    window.open(link, '_blank', 'noreferrer');
    return;
  }
  const eid = Number(item?.eventId || 0);
  if (eid > 0) {
    const ev = findScheduleEventByIdAndKind(eid, item?.eventKind);
    const meet = String(ev?.meetLink || '').trim();
    if (meet) {
      closeStackDetailsModal();
      window.open(meet, '_blank', 'noreferrer');
      return;
    }
    const html = String(ev?.htmlLink || '').trim();
    if (html) {
      window.open(html, '_blank', 'noreferrer');
      return;
    }
    const aj = String(ev?.appJoinUrl || '').trim();
    if (aj) {
      closeStackDetailsModal();
      window.location.href = aj;
      return;
    }
  }
  const sessionId = Number(item?.sessionId || 0);
  if (sessionId > 0) {
    closeStackDetailsModal();
    openSupervisionEditInScheduleModal(String(item?.dayName || ''), Number(item?.hour || 0));
    selectedSupvSessionId.value = sessionId;
  }
};

const onCellBlockDoubleClick = (e, block, dayName, hour, minute = 0) => {
  e?.preventDefault?.();
  e?.stopPropagation?.();
  const kind = String(block?.kind || '');
  if (kind !== 'gevt') return;
  const sessions = supervisionSessionsInCell(dayName, hour, minute);
  const hasMeetSessionInCell = sessions.some((s) => String(s?.googleMeetLink || s?.joinUrl || '').trim());
  if (!hasMeetSessionInCell) return;
  const firstWithLink = sessions.find((s) => String(s?.joinUrl || s?.googleMeetLink || '').trim());
  const link = String(block?.link || firstWithLink?.joinUrl || firstWithLink?.googleMeetLink || '').trim();
  if (!link) return;
  clearGevtClickTimer();
  window.open(link, '_blank', 'noreferrer');
};

watch([modalHour, modalStartHour, modalEndHour, modalStartMinute, modalEndMinute, canUseQuarterHourInput, disableEndTimeInput], () => {
  if (disableEndTimeInput.value) {
    modalStartMinute.value = 0;
    modalEndMinute.value = 0;
    return;
  }
  ensureModalEndTimeValid();
}, { immediate: true });

/** Snap back to Open finder view (main schedule grid). Called when user clicks "My schedule" tab. */
const resetToOpenFinder = () => {
  viewMode.value = 'open_finder';
};

defineExpose({ resetToOpenFinder, openQuickBook });
</script>

<style scoped>
.sched-wrap {
  --sched-ink: #0f172a;
  --sched-muted: #64748b;
  --sched-line: rgba(15, 23, 42, 0.08);
  --sched-soft: #f8fafc;
  --sched-today: rgba(167, 139, 250, 0.12);
}
.sched-toolbar { margin-top: 4px; }
.sched-tool-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin-top: 8px;
  align-items: center;
}
.sched-tool-cluster {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  padding: 3px 8px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
}
.sched-tool-cluster--wrap {
  border-radius: 12px;
  width: 100%;
}
.sched-tool-cluster__label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-secondary, #64748b);
  margin-right: 2px;
}
.sched-select--compact {
  min-width: 132px;
  max-width: 180px;
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 999px;
}
.sched-pill--emphasis {
  border-color: rgba(37, 99, 235, 0.35);
  color: rgba(29, 78, 216, 0.95);
  font-weight: 900;
}
.sched-pill--emphasis.on {
  background: rgba(37, 99, 235, 0.14);
}
.sched-pill-link {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}
.sched-day-focus-bar {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.sched-more-tools {
  margin-top: 6px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  padding: 2px 0;
}
.sched-more-tools[open] {
  border-color: var(--border, #e2e8f0);
  background: var(--bg-alt, #f8fafc);
  padding: 6px 10px;
}
.sched-more-tools__summary {
  cursor: pointer;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
  font-weight: 700;
  font-size: 12px;
  color: var(--text-secondary, #64748b);
}
.sched-more-tools__summary .muted {
  font-weight: 600;
  font-size: 11px;
}
.sched-more-tools__body {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sched-chrome-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.sched-chrome-title-block { min-width: 0; }
.sched-page-title {
  margin: 0;
  font-size: 28px;
  font-weight: 800;
  color: var(--sched-ink);
  letter-spacing: -0.03em;
  line-height: 1.15;
}
.sched-page-sub {
  margin: 4px 0 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--sched-muted);
  line-height: 1.35;
}
.sched-week-range {
  margin: 6px 0 0;
  font-size: 12px;
  font-weight: 650;
  color: #94a3b8;
}
.sched-chrome-nav {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  flex-wrap: wrap;
}
.sched-nav-btn {
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #334155;
  font-weight: 700;
  font-size: 13px;
  padding: 8px 14px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.sched-nav-btn:hover:not(:disabled) {
  background: var(--sched-soft);
  border-color: #cbd5e1;
}
.sched-nav-btn:disabled,
.sched-nav-icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.sched-nav-arrows {
  display: inline-flex;
  gap: 4px;
}
.sched-nav-icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #475569;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
}
.sched-nav-icon-btn:hover:not(:disabled) {
  background: var(--sched-soft);
  border-color: #cbd5e1;
}
.sched-nav-view-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #334155;
  font-weight: 700;
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 10px;
  white-space: nowrap;
}
.sched-nav-view-pill::after {
  content: '';
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid #94a3b8;
  margin-left: 2px;
}
.sched-span-switch {
  display: inline-flex;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  background: #f8fafc;
}
.sched-span-btn {
  border: 0;
  background: transparent;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 700;
  color: #64748b;
  cursor: pointer;
}
.sched-span-btn.on {
  background: #fff;
  color: #0f172a;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.06);
}
.sched-day-timeline {
  position: relative;
  margin-top: 10px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: #fff;
  padding: 12px 12px 72px;
}
.sched-day-timeline__strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 8px;
  margin-bottom: 8px;
  -webkit-overflow-scrolling: touch;
}
.sched-day-timeline__chip {
  flex: 0 0 auto;
  min-width: 56px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 12px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
}
.sched-day-timeline__chip.on {
  background: #1e293b;
  border-color: #1e293b;
  color: #fff;
}
.sched-day-timeline__chip.today:not(.on) {
  border-color: #93c5fd;
}
.sched-day-timeline__dow {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}
.sched-day-timeline__date {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.9;
}
.sched-day-timeline__title {
  font-weight: 800;
  font-size: 15px;
  margin-bottom: 10px;
}
.sched-day-timeline__hours {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.sched-day-timeline__row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 8px;
  min-height: 56px;
  border-top: 1px solid rgba(226, 232, 240, 0.9);
  padding: 8px 0;
}
.sched-day-timeline__time {
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  padding-top: 4px;
}
.sched-day-timeline__cards {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.sched-day-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  text-align: left;
  border-radius: 12px;
  border: 1.5px solid transparent;
  padding: 10px 12px;
  cursor: pointer;
  background: rgba(248, 250, 252, 0.95);
}
.sched-day-card__body {
  min-width: 0;
  flex: 1 1 auto;
}
.sched-day-card__title {
  font-size: 14px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.92);
  line-height: 1.25;
}
.sched-day-card__meta {
  margin-top: 4px;
  font-size: 12px;
}
.sched-day-timeline__add {
  align-self: flex-start;
  border: 1px dashed #cbd5e1;
  background: #fff;
  color: #64748b;
  border-radius: 8px;
  width: 32px;
  height: 28px;
  font-weight: 800;
  cursor: pointer;
}
.sched-day-timeline__fab {
  position: absolute;
  right: 16px;
  bottom: 16px;
  width: 52px;
  height: 52px;
  border-radius: 999px;
  border: 0;
  background: #0f766e;
  color: #fff;
  font-size: 28px;
  font-weight: 500;
  line-height: 1;
  box-shadow: 0 8px 20px rgba(15, 118, 110, 0.35);
  cursor: pointer;
}
@media (min-width: 821px) {
  .sched-day-timeline { display: none; }
}
.sched-toolbar-main {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
}
.sched-toolbar-left,
.sched-toolbar-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
  flex-wrap: wrap;
}
.sched-btn {
  width: auto;
  min-width: auto;
  white-space: nowrap;
  padding-left: 10px;
  padding-right: 10px;
}
.sched-toolbar-secondary {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: thin;
}
.sched-zoom-controls {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-alt) 88%, white);
  flex: 0 0 auto;
}
.sched-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}
.sched-pill {
  border: 1px solid var(--border);
  background: #fff;
  color: var(--text-secondary);
  font-weight: 800;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 999px;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease, transform 0.06s ease;
}
.sched-pill:hover { transform: translateY(-0.5px); }
.sched-pill:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
.sched-pill.on {
  background: rgba(59, 130, 246, 0.10);
  border-color: rgba(59, 130, 246, 0.35);
  color: rgba(37, 99, 235, 0.95);
}
.sched-chip {
  border: 1px solid var(--border);
  background: #fff;
  color: var(--text-secondary);
  font-weight: 800;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 999px;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}
.sched-chip:hover { border-color: rgba(59, 130, 246, 0.35); }
.sched-chip:disabled { opacity: 0.55; cursor: not-allowed; }
.sched-chip.on {
  background: rgba(242, 153, 74, 0.14);
  border-color: rgba(242, 153, 74, 0.42);
  color: rgba(146, 64, 14, 0.95);
}
.supv-presenter-list {
  display: grid;
  gap: 8px;
  margin-top: 6px;
}
.supv-presenter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--bg-card);
}
.sched-calendars-actions {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  margin-right: 6px;
}
.sched-icon-btn {
  border: 1px solid var(--border);
  background: #fff;
  color: var(--text-secondary);
  font-weight: 900;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.sched-icon-btn:hover { border-color: rgba(59, 130, 246, 0.35); }
.sched-icon-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.sched-office-toolbar-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
  min-width: 0;
}

.sched-office-cta {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #166534 0%, #15803d 100%);
  color: #fff;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(22, 101, 52, 0.28);
  transition: transform 0.12s, box-shadow 0.15s, filter 0.15s, background 0.2s;
  text-align: left;
  max-width: 100%;
}

.sched-office-cta--active {
  background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%);
  box-shadow: 0 4px 14px rgba(29, 78, 216, 0.28);
}

.sched-office-cta:hover:not(:disabled) {
  filter: brightness(1.05);
  box-shadow: 0 6px 18px rgba(22, 101, 52, 0.34);
  transform: translateY(-1px);
}

.sched-office-cta--active:hover:not(:disabled) {
  box-shadow: 0 6px 18px rgba(29, 78, 216, 0.34);
}

.sched-office-cta:focus-visible {
  outline: 2px solid #86efac;
  outline-offset: 2px;
}

.sched-office-cta:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.sched-office-cta-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.18);
  flex-shrink: 0;
}

.sched-office-cta-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sched-office-cta-title {
  font-size: 15px;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.sched-office-cta-sub {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.92;
  line-height: 1.3;
}

.sched-view-switch {
  display: inline-flex;
  align-items: center;
  background: rgba(15, 23, 42, 0.04);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px;
  gap: 2px;
  max-width: 100%;
}
.sched-seg {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-weight: 900;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
}
.sched-seg.on {
  background: #fff;
  color: var(--text-primary);
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.06);
}
.sched-seg--back {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1.5px solid #bfdbfe;
  font-weight: 700;
}
.sched-seg--back:hover {
  background: #dbeafe;
  color: #1e40af;
  border-color: #93c5fd;
}
.sched-seg:disabled { opacity: 0.55; cursor: not-allowed; }

/* Office reminder: pulse to draw attention */
.sched-office-pulse {
  animation: sched-office-pulse 2s ease-in-out 3;
}
@keyframes sched-office-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Office reminder toast (3s) */
.sched-office-reminder-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--primary);
  color: white;
  padding: 12px 20px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 14px;
  box-shadow: var(--shadow-lg);
  z-index: 9999;
  max-width: 90vw;
  text-align: center;
  animation: sched-toast-fade 0.3s ease-out;
}
@keyframes sched-toast-fade {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
.sched-inline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 800;
}
.sched-select {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: white;
  padding: 6px 10px;
  font-weight: 700;
  color: var(--text-primary);
  min-width: 220px;
}
.sched-inline.compact {
  gap: 6px;
}
.sched-select.compact {
  min-width: 120px;
}
.office-quick-glance {
  margin-top: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.86);
  padding: 10px;
}
.office-quick-glance-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.office-quick-glance-title {
  font-weight: 900;
  color: var(--text-primary);
}
.office-quick-glance-controls {
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
}
.office-quick-glance-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow: auto;
}
.office-quick-glance-row {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) 130px minmax(120px, 1fr);
  gap: 10px;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 6px 8px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.office-quick-glance-row:hover {
  background: rgba(37, 99, 235, 0.06);
}
.office-quick-glance-row--disabled {
  cursor: default;
  opacity: 0.85;
}
.office-quick-glance-row--disabled:hover {
  background: transparent;
}
.office-quick-glance-room {
  font-weight: 800;
}
.office-quick-glance-status {
  font-size: 12px;
  font-weight: 900;
  border-radius: 999px;
  padding: 3px 8px;
  width: fit-content;
}
.office-quick-glance-status.state-assigned_booked {
  background: rgba(220, 38, 38, 0.12);
  color: rgba(153, 27, 27, 0.95);
}
.office-quick-glance-status.state-assigned_available,
.office-quick-glance-status.state-assigned_temporary {
  background: rgba(22, 163, 74, 0.12);
  color: rgba(21, 128, 61, 0.95);
}
.office-quick-glance-status.state-open {
  background: rgba(37, 99, 235, 0.12);
  color: rgba(30, 64, 175, 0.95);
}
.office-quick-glance-status.state-requested {
  background: rgba(245, 158, 11, 0.15);
  color: rgba(180, 83, 9, 0.95);
}
.office-quick-glance-provider {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 700;
}
.sched-calendars {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-alt) 88%, white);
  flex: 0 0 auto;
}
.sched-org-filters {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  margin-top: 0;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-alt) 88%, white);
  flex: 0 0 auto;
}
.sched-calendars-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  white-space: nowrap;
}
.sched-grid-wrap {
  margin-top: 14px;
  overflow-x: auto;
}
.sched-legend {
  display: flex;
  flex-flow: row wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  margin-bottom: 12px;
  color: var(--text-secondary);
  font-size: 13px;
  width: 100%;
}
.sched-legend-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 10px 5px 8px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #e8eef5;
  color: #475569;
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
  line-height: 1.2;
  flex: 0 0 auto;
}
.sched-legend-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  flex: 0 0 9px;
  display: inline-block;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.06);
}
.sched-legend-dot--ring {
  background: transparent !important;
  box-shadow: inset 0 0 0 2px currentColor;
}
.sched-legend-dot--request { background: #f2c94c; }
.sched-legend-dot--school { background: #56a8e8; }
.sched-legend-dot--supv { color: #8b5cf6; background: rgba(139, 92, 246, 0.18); }
.sched-legend-dot--sevt { background: #34d399; }
.sched-legend-dot--oa { background: #4ade80; }
.sched-legend-dot--ot { color: #f472b6; background: rgba(244, 114, 182, 0.16); }
.sched-legend-dot--ob { background: #f87171; }
.sched-legend-dot--intake-ip { color: #22c55e; background: rgba(34, 197, 94, 0.14); }
.sched-legend-dot--intake-vi { color: #3b82f6; background: rgba(59, 130, 246, 0.14); }
.sched-legend-dot--portal { color: #0d9488; background: rgba(13, 148, 136, 0.14); }
.sched-legend-dot--gbusy { background: #94a3b8; }
.sched-legend-dot--peerbusy { background: #64748b; }
.peer-busy-panel {
  margin-top: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-alt, #f8fafc);
  padding: 10px 12px;
}
.peer-busy-panel__head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: baseline;
  flex-wrap: wrap;
}
.peer-busy-panel__controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 8px;
}
.peer-busy-search { min-width: 200px; max-width: 280px; }
.peer-busy-details {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}
.peer-busy-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-top: 8px;
  max-height: 120px;
  overflow: auto;
}
.peer-busy-item {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  font-weight: 700;
}
.sched-legend-dot--gevt { background: #60a5fa; }
.sched-legend-dot--ebusy { background: #9ca3af; }
.sched-legend-dot--agency {
  background: #cbd5e1;
  box-shadow: inset 0 0 0 2px #64748b;
}
.swatch {
  width: 14px;
  height: 10px;
  border-radius: 6px;
  border: 1px solid rgba(0,0,0,0.12);
  display: inline-block;
}
.swatch-request { background: var(--sched-request-bg, rgba(242, 201, 76, 0.35)); border-color: var(--sched-request-border, rgba(242, 201, 76, 0.65)); }
.swatch-school { background: var(--sched-school-bg, rgba(45, 156, 219, 0.28)); border-color: var(--sched-school-border, rgba(45, 156, 219, 0.60)); }
.swatch-supv { background: var(--sched-supv-bg, rgba(155, 81, 224, 0.20)); border-color: var(--sched-supv-border, rgba(155, 81, 224, 0.55)); }
.swatch-sevt { background: rgba(16, 185, 129, 0.18); border-color: rgba(5, 150, 105, 0.45); }
.swatch-oa { background: var(--sched-oa-bg, rgba(39, 174, 96, 0.22)); border-color: var(--sched-oa-border, rgba(39, 174, 96, 0.55)); }
.swatch-ot { background: var(--sched-ot-bg, rgba(242, 153, 74, 0.24)); border-color: var(--sched-ot-border, rgba(242, 153, 74, 0.58)); }
.swatch-ob { background: var(--sched-ob-bg, rgba(235, 87, 87, 0.22)); border-color: var(--sched-ob-border, rgba(235, 87, 87, 0.58)); }
.swatch-intake-ip { background: rgba(34, 197, 94, 0.18); border-color: rgba(21, 128, 61, 0.45); }
.swatch-intake-vi { background: rgba(59, 130, 246, 0.18); border-color: rgba(29, 78, 216, 0.45); }
.swatch-gbusy { background: var(--sched-gbusy-bg, rgba(17, 24, 39, 0.18)); border-color: var(--sched-gbusy-border, rgba(17, 24, 39, 0.45)); }
.swatch-gevt { background: rgba(59, 130, 246, 0.14); border-color: rgba(59, 130, 246, 0.35); }
.swatch-ebusy { background: var(--sched-ebusy-bg, rgba(107, 114, 128, 0.18)); border-color: var(--sched-ebusy-border, rgba(107, 114, 128, 0.45)); }
.sched-grid {
  display: grid;
  border: 1px solid #e8eef5;
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
}
.sched-head-cell {
  padding: 12px 10px;
  font-weight: 750;
  background: #fff;
  border-bottom: 1px solid #e8eef5;
  border-left: 1px solid var(--sched-line);
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sched-head-cell-day {
  cursor: pointer;
}
.sched-head-cell-day:hover {
  background: color-mix(in srgb, #fff 84%, rgba(167, 139, 250, 0.12));
}
.sched-head-focused {
  box-shadow: inset 0 0 0 2px rgba(99, 102, 241, 0.35);
}
.sched-head-today {
  background: var(--sched-today);
  box-shadow: none;
}
.sched-grid > .sched-head-cell:first-child {
  border-left: none;
}
.sched-head-day {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  justify-content: center;
  line-height: 1.05;
}
.sched-head-dow {
  font-weight: 750;
  font-size: 13px;
  color: #334155;
  letter-spacing: -0.01em;
}
.sched-head-date {
  font-size: 12px;
  font-weight: 650;
  color: var(--text-secondary);
}
.sched-hour {
  padding: 8px 10px;
  font-weight: 650;
  font-size: 12px;
  color: #64748b;
  border-top: 1px solid var(--sched-line);
  background: #fff;
}
.sched-hour-quarter {
  font-weight: 600;
  font-size: 11px;
  color: #94a3b8;
  border-top: 1px solid rgba(15, 23, 42, 0.06);
  padding-top: 5px;
  padding-bottom: 5px;
}
.sched-cell {
  border-top: 1px solid var(--sched-line);
  border-left: 1px solid var(--sched-line);
  background: #fff;
  min-height: var(--sched-cell-min-height, 36px);
  padding: 3px 5px;
  text-align: left;
  position: relative;
  overflow: hidden;
}
.sched-cell-quarter {
  border-top: 1px solid rgba(15, 23, 42, 0.06);
  min-height: max(18px, calc(var(--sched-cell-min-height, 36px) * 0.7));
  padding-top: 2px;
  padding-bottom: 2px;
}
.sched-wrap-quarter .sched-cell-quarter {
  border-top-color: rgba(15, 23, 42, 0.05);
  padding-top: 0;
  padding-bottom: 0;
}
.sched-cell-today {
  background: rgba(167, 139, 250, 0.05);
  box-shadow: none;
}
.sched-cell.clickable {
  cursor: pointer;
}
.sched-cell.clickable:hover {
  background: rgba(148, 163, 184, 0.06);
}
.sched-cell-selected {
  box-shadow: inset 0 0 0 2px rgba(99, 102, 241, 0.55);
}
.cell-plus-btn {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #cbd5e1;
  font-weight: 600;
  font-size: 16px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  opacity: 0.55;
  transition: opacity 120ms ease, color 120ms ease, background 120ms ease;
  z-index: 3;
}
.sched-cell:hover .cell-plus-btn,
.sched-cell-selected .cell-plus-btn {
  opacity: 0.95;
  color: #94a3b8;
}
.cell-plus-btn:hover {
  background: rgba(226, 232, 240, 0.7);
  color: #64748b;
  transform: translateY(-50%);
}
.selection-toolbar {
  margin-top: 10px;
  margin-bottom: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(59, 130, 246, 0.06);
}
.selection-count {
  font-weight: 800;
  color: var(--text-primary);
}
.selection-actions {
  display: inline-flex;
  gap: 8px;
}
.join-prompt {
  margin-bottom: 10px;
  border: 1px solid rgba(37, 99, 235, 0.35);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: linear-gradient(120deg, rgba(219, 234, 254, 0.72), rgba(238, 242, 255, 0.74));
}
.join-prompt-copy {
  display: inline-flex;
  gap: 6px;
  align-items: baseline;
  color: var(--text-primary);
  flex-wrap: wrap;
}
.join-prompt-actions {
  display: inline-flex;
  gap: 8px;
  flex: 0 0 auto;
}
.stack-details-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.stack-details-multi-hint {
  margin-bottom: 4px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1e3a8a;
  font-size: 0.85rem;
  line-height: 1.4;
}
.stack-details-item-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.stack-details-item-wrap--editing .stack-details-static {
  border-color: #166534;
  box-shadow: 0 0 0 1px rgba(22, 101, 52, 0.25);
}
.stack-details-static {
  border: 1px solid var(--border);
  background: var(--bg-card, #fff);
  border-radius: 10px;
  padding: 10px;
}
.stack-details-edit-btn {
  background: #166534 !important;
  border-color: #166534 !important;
  color: #fff !important;
  font-weight: 700;
}
.stack-details-edit-btn:hover:not(:disabled) {
  background: #14532d !important;
}
.stack-details-notes {
  border: 1.5px solid #94a3b8 !important;
  background: #f8fafc !important;
  color: #0f172a;
}
.stack-details-notes::placeholder {
  color: #64748b;
  opacity: 1;
}
.stack-details-kind {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.stack-details-detail {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-secondary);
  white-space: pre-wrap;
}
.stack-details-edit {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border, #e5e7eb);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stack-details-edit .lbl {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.stack-details-actions {
  margin-top: 10px;
}
.stack-details-company-event {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border, #e5e7eb);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.stack-details-section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.stack-details-kiosk-pin {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.stack-details-kiosk-label {
  font-weight: 600;
  font-size: 13px;
}
.stack-details-kiosk-code {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.12em;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--bg-secondary, #f3f4f6);
}
.stack-details-kiosk-hint {
  font-size: 12px;
}
.stack-details-coworker-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.5;
}
.stack-details-participants {
  font-size: 13px;
}
.stack-details-open-btn {
  align-self: flex-start;
}
.stack-details-activity-row {
  margin-left: 12px;
  padding-left: 12px;
  border-left: 2px solid var(--border);
}
.stack-details-activity-content {
  margin-top: 6px;
  max-height: 180px;
  overflow-y: auto;
}
.stack-details-activity-content .activity-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.stack-details-activity-content .activity-item {
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--bg-secondary, #f3f4f6);
  font-size: 13px;
}
.stack-details-activity-content .activity-sender {
  font-weight: 600;
  margin-right: 6px;
}
.stack-details-activity-content .activity-time {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}
.stack-details-item {
  width: 100%;
  text-align: left;
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 10px;
  padding: 10px;
  cursor: pointer;
}
.stack-details-item:disabled {
  opacity: 0.7;
  cursor: default;
}

.google-event-modal .google-event-details {
  padding: 4px 0;
}
.google-event-modal .google-event-time {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}
.google-event-modal .google-event-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stack-details-label {
  font-weight: 800;
  color: var(--text-primary);
}
.stack-details-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-secondary);
}
.cell-blocks {
  display: flex;
  gap: 4px;
  align-items: stretch;
  justify-content: flex-start;
  height: 100%;
  position: relative;
  z-index: 1;
}

.cell-avail {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.85;
}
.cell-avail-virtual {
  background: rgba(16, 185, 129, 0.22);
}
.cell-avail-office {
  background: rgba(59, 130, 246, 0.18);
}
.cell-avail-both {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.22), rgba(59, 130, 246, 0.18));
}
.cell-office-overlay {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 1;
  pointer-events: none;
  font-size: 10px;
  font-weight: 900;
  color: rgba(15, 23, 42, 0.92);
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(15, 23, 42, 0.18);
  border-radius: 999px;
  padding: 1px 6px;
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--officeOverlayColor, #64748b) 24%, transparent);
}
.cell-block {
  flex: 1 1 0;
  min-width: 0;
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 3px 7px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: rgba(15, 23, 42, 0.88);
  backdrop-filter: none;
}
.sched-wrap-quarter .cell-blocks {
  gap: 0;
  align-items: stretch;
  height: 100%;
}
.sched-wrap-quarter .cell-block {
  height: 100%;
  border-radius: 6px;
  border-color: transparent;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 700;
  margin-right: 0;
  margin-top: -1px;
  margin-bottom: -1px;
  backdrop-filter: none;
  box-shadow: none;
  opacity: 0.98;
  justify-content: center;
}
.sched-wrap-quarter .cell-block:last-child {
  margin-right: 0;
}
.sched-wrap-quarter .cell-block:hover,
.sched-wrap-quarter .cell-block-hovered {
  opacity: 1;
}
.sched-wrap-quarter .cell-block-agency-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.75);
}
.sched-wrap-quarter .cell-block-agency-icon {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  margin-left: -3px;
  margin-right: -1px;
}
.sched-wrap-quarter .cell-block:has(.cell-block-agency-icon) {
  gap: 2px;
  padding-left: 2px;
  padding-right: 4px;
}
.sched-wrap-quarter .cell-block-text {
  max-width: calc(100% - 10px);
  text-align: center;
}
.sched-wrap-quarter .cell-block-segment-start {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  margin-top: 0;
  align-items: flex-end;
  padding-bottom: 1px;
}
.sched-wrap-quarter .cell-block-segment-middle {
  border-radius: 0;
  margin-top: 0;
  margin-bottom: 0;
}
.sched-wrap-quarter .cell-block-segment-end {
  border-top-left-radius: 0;
  border-top-right-radius: 0;
  margin-bottom: 0;
}
.sched-wrap-quarter .cell-block-segment-single {
  margin-top: 0;
  margin-bottom: 0;
  border-radius: 6px;
}
.cell-block-agency-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  flex: 0 0 7px;
  background: var(--agencyDot, rgba(71, 85, 105, 0.85));
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.9), 0 0 0 2px rgba(15, 23, 42, 0.18);
}
.cell-block-agency-icon {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  border-radius: 4px;
  object-fit: cover;
  object-position: center;
  background: transparent;
  margin-left: -4px;
  margin-right: -2px;
  align-self: center;
}
.cell-block:has(.cell-block-agency-icon) {
  gap: 3px;
  padding-left: 3px;
}
.sched-legend-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
  margin-right: 4px;
}
.sched-legend-icon {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  object-fit: cover;
  object-position: center;
  display: block;
  background: transparent;
}
.cell-block-type-stripe {
  width: 3px;
  align-self: stretch;
  border-radius: 999px;
  flex: 0 0 3px;
  background: var(--blockTypeStripe, rgba(100, 116, 139, 0.75));
}
.sched-org-chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  display: inline-block;
  margin-right: 4px;
  vertical-align: middle;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.12);
}
.cell-block-text {
  max-width: calc(100% - 18px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-block:has(.cell-block-agency-icon) .cell-block-text {
  max-width: calc(100% - 24px);
}
.cell-block-request { background: var(--blockFill, rgba(253, 224, 71, 0.42)); border-color: var(--blockBorder, rgba(234, 179, 8, 0.28)); }
.cell-block-school { background: var(--blockFill, rgba(147, 197, 253, 0.45)); border-color: var(--blockBorder, rgba(59, 130, 246, 0.22)); }
.cell-block-pending-badge {
  flex: 0 0 auto;
  margin-left: auto;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.02em;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 999px;
  color: rgba(113, 63, 18, 0.95);
  background: rgba(253, 224, 71, 0.92);
  border: 1px solid rgba(234, 179, 8, 0.45);
  white-space: nowrap;
}
.cell-block-supv { background: var(--blockFill, rgba(216, 180, 254, 0.42)); border-color: var(--blockBorder, rgba(147, 51, 234, 0.22)); }
.cell-block-oa { background: var(--blockFill, rgba(191, 219, 254, 0.55)); border-color: var(--blockBorder, rgba(59, 130, 246, 0.2)); }
.cell-block-office {
  flex-direction: row;
  align-items: center;
  gap: 4px;
}
.cell-block-office-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
  line-height: 1.15;
}
.cell-block-office-status {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: rgba(30, 64, 175, 0.92);
  white-space: nowrap;
}
.cell-block-door-icon {
  flex: 0 0 auto;
}
.cell-block-office-status-text {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 9.5em;
}
.cell-block-office-empty {
  font-size: 9px;
  font-style: italic;
  font-weight: 600;
  color: rgba(71, 85, 105, 0.9);
}
.cell-block-office--reserved,
.cell-block-office--temp {
  border-style: dashed;
  border-width: 1.5px;
}
.cell-block-office--booked {
  border-style: solid;
  border-width: 1.5px;
}
.cell-block-office--reserved {
  background: var(--blockFill, rgba(191, 219, 254, 0.42));
  border-color: var(--blockBorder, rgba(37, 99, 235, 0.55));
}
.cell-block-office--temp {
  background: var(--blockFill, rgba(254, 215, 170, 0.45));
  border-color: var(--blockBorder, rgba(194, 65, 12, 0.55));
}
.cell-block-office--temp .cell-block-office-status { color: rgba(154, 52, 18, 0.95); }
.cell-block-office--booked {
  background: var(--blockFill, rgba(187, 247, 208, 0.5));
  border-color: var(--blockBorder, rgba(21, 128, 61, 0.55));
}
.cell-block-office--booked .cell-block-office-status { color: rgba(22, 101, 52, 0.95); }
.cell-block-peer-face {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  border-radius: 999px;
  object-fit: cover;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.14);
}
.cell-block-peer-face--initials {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.02em;
}
.peer-busy-face {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  object-fit: cover;
  flex: 0 0 22px;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.12);
}
.peer-busy-face--initials {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 800;
  color: #fff;
}
.sched-legend-dot--dashed {
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.25);
  background: repeating-linear-gradient(
    45deg,
    #4ade80,
    #4ade80 2px,
    transparent 2px,
    transparent 4px
  ) !important;
  background-color: rgba(74, 222, 128, 0.35) !important;
}
.cell-block-ot { background: var(--blockFill, rgba(251, 207, 232, 0.5)); border-color: var(--blockBorder, rgba(236, 72, 153, 0.22)); }
.cell-block-ob { background: var(--blockFill, rgba(254, 202, 202, 0.55)); border-color: var(--blockBorder, rgba(239, 68, 68, 0.22)); }

.office-room-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.8);
}
.office-room-option {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text-primary);
}
.office-room-option.disabled {
  opacity: 0.55;
}
.office-room-label {
  font-weight: 800;
}
.office-room-meta {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  white-space: nowrap;
}
.cell-block-gbusy { background: var(--sched-gbusy-bg, rgba(148, 163, 184, 0.22)); border-color: var(--sched-gbusy-border, rgba(100, 116, 139, 0.28)); color: rgba(51, 65, 85, 0.9); }
.cell-block-peerbusy {
  background: var(--blockFill, rgba(100, 116, 139, 0.16));
  border-color: var(--blockBorder, rgba(100, 116, 139, 0.32));
  color: rgba(15, 23, 42, 0.92);
  opacity: 0.95;
  cursor: pointer;
  box-shadow: inset 3px 0 0 var(--peerAccent, #64748b);
}
.cell-block-peer-interactive { cursor: pointer; }
.cell-block-peer-session { font-weight: 800; }
.cell-block-peer-hold { font-style: italic; }
.cell-block-peer-opening { opacity: 0.88; }
.peer-busy-swatch {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  flex: 0 0 10px;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.12);
}
.peer-busy-tenant-icon {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  object-fit: cover;
  object-position: center;
  background: transparent;
}
.peer-busy-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.peer-activity-modal { max-width: 480px; }
.peer-activity-list { display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow: auto; }
.peer-activity-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.95);
  border: 1px solid rgba(15, 23, 42, 0.08);
}
.peer-activity-type {
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  padding: 3px 6px;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.16);
  color: rgba(51, 65, 85, 0.95);
}
.peer-activity-type--session { background: rgba(185, 28, 28, 0.14); color: #991b1b; }
.peer-activity-type--hold { background: rgba(194, 65, 12, 0.14); color: #9a3412; }
.peer-activity-type--opening { background: rgba(21, 128, 61, 0.14); color: #166534; }
.peer-activity-type--supervision { background: rgba(126, 34, 206, 0.14); color: #6b21a8; }
.peer-activity-type--school { background: rgba(37, 99, 235, 0.14); color: #1d4ed8; }
.peer-activity-title { font-weight: 700; font-size: 13px; }
.peer-activity-body { min-width: 0; }
.cell-block-gevt { background: rgba(191, 219, 254, 0.45); border-color: rgba(59, 130, 246, 0.2); cursor: pointer; }
.cell-block-sevt { background: var(--blockFill, rgba(167, 243, 208, 0.55)); border-color: var(--blockBorder, rgba(16, 185, 129, 0.22)); color: rgba(6, 95, 70, 0.95); cursor: pointer; }
.cell-block-ebusy { background: var(--sched-ebusy-bg, rgba(203, 213, 225, 0.4)); border-color: var(--sched-ebusy-border, rgba(100, 116, 139, 0.28)); color: rgba(51, 65, 85, 0.9); }
.cell-block-intake-ip { background: rgba(187, 247, 208, 0.55); border-color: rgba(34, 197, 94, 0.25); color: rgba(21, 128, 61, 0.95); }
.cell-block-intake-vi { background: rgba(191, 219, 254, 0.55); border-color: rgba(59, 130, 246, 0.22); color: rgba(29, 78, 216, 0.95); }
.cell-block-portal { background: rgba(153, 246, 228, 0.55); border-color: rgba(13, 148, 136, 0.28); color: rgba(15, 118, 110, 0.98); cursor: pointer; }
.cell-block-more { background: rgba(148, 163, 184, 0.18); border-color: rgba(148, 163, 184, 0.45); color: rgba(51, 65, 85, 0.92); }

.cell-block-selected,
.cell-block-hovered {
  box-shadow: inset 0 0 0 2px rgba(37, 99, 235, 0.9);
  outline: 2px solid rgba(37, 99, 235, 0.5);
  outline-offset: 1px;
  z-index: 1;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: radial-gradient(circle at top right, rgba(59, 130, 246, 0.14), rgba(17, 24, 39, 0.58));
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  z-index: 5000;
}
.modal-backdrop--request {
  padding: 12px;
  align-items: flex-start;
  overflow-y: auto;
}
@media (min-width: 480px) {
  .modal-backdrop--request {
    padding: 16px;
    align-items: center;
  }
}
.modal {
  width: 100%;
  max-width: 640px;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.92), rgba(248, 250, 252, 0.84));
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.65);
  box-shadow: 0 22px 60px rgba(15, 23, 42, 0.34);
  padding: 16px;
}
.modal--request {
  max-width: 720px;
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.modal--new-request {
  --nr-purple: #4F46E5;
  --nr-purple-deep: #4338CA;
  --nr-teal: #0D9488;
  --nr-cyan: #0891B2;
  --nr-green: #16A34A;
  --nr-orange: #EA580C;
  --nr-blue: #2563EB;
  --nr-grey: #94A3B8;
  --nr-ink: #0f172a;
  --nr-muted: #64748b;
  --nr-line: #e8eef5;
  --nr-soft: #f8fafc;
  max-width: min(920px, 100%);
  padding: 0;
  background: #fff;
  border-radius: 18px;
  border: 1px solid var(--nr-line);
  box-shadow: 0 24px 56px rgba(15, 23, 42, 0.22);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.nr-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 22px 16px;
  border-bottom: 1px solid var(--nr-line);
  background: #fff;
}
.nr-head-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}
.nr-head-icon {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--nr-purple);
  background: rgba(79, 70, 229, 0.08);
  flex: 0 0 auto;
  box-shadow: none;
}
.nr-title {
  font-size: 1.4rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--nr-ink);
  line-height: 1.15;
}
.nr-subtitle {
  margin-top: 3px;
  font-size: 0.9rem;
  color: var(--nr-muted);
  line-height: 1.35;
  max-width: 42ch;
}
.nr-slot-meta {
  margin-top: 6px;
  display: inline-flex;
  align-items: center;
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
  background: var(--nr-soft);
  border: 1px solid var(--nr-line);
  border-radius: 999px;
  padding: 3px 10px;
}
.nr-close {
  border: none;
  background: transparent;
  color: var(--nr-grey);
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.nr-close:hover { background: #f1f5f9; color: #334155; }
.nr-layout {
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
  gap: 0;
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;
}
.nr-sidebar {
  padding: 16px 14px 18px;
  border-right: 1px solid var(--nr-line);
  background: var(--nr-soft);
  overflow-y: auto;
  max-height: min(70vh, 640px);
}
.nr-sidebar-title {
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #94a3b8;
  margin: 0 0 10px 2px;
}
.nr-action-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.nr-action {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  text-align: left;
  border: 1px solid transparent;
  background: #fff;
  border-radius: 12px;
  padding: 9px 10px;
  cursor: pointer;
  box-shadow: 0 0 0 1px #e8eef5;
  transition: border-color 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
}
.nr-action:hover:not(:disabled) {
  box-shadow: 0 0 0 1px rgba(79, 70, 229, 0.28);
  background: #fff;
}
.nr-action.on {
  background: #fff;
  border-color: transparent;
  color: var(--nr-ink);
  box-shadow: 0 0 0 2px var(--nr-purple), 0 8px 18px rgba(79, 70, 229, 0.12);
}
.nr-action.on .nr-action-desc { color: var(--nr-muted); }
.nr-action.on .nr-action-icon {
  background: rgba(79, 70, 229, 0.12);
  color: var(--nr-purple);
  border-color: transparent;
}
.nr-action.on .nr-action-label { color: var(--nr-purple-deep); }
.nr-action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.nr-action-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: #f8fafc;
  color: #475569;
}
.nr-action-icon.tone-teal,
.nr-action-icon.tone-cyan { color: var(--nr-teal); background: rgba(20, 184, 166, 0.1); }
.nr-action-icon.tone-sky,
.nr-action-icon.tone-indigo,
.nr-action-icon.tone-violet { color: var(--nr-purple); background: rgba(99, 102, 241, 0.12); }
.nr-action-icon.tone-emerald,
.nr-action-icon.tone-green { color: var(--nr-green); background: rgba(34, 197, 94, 0.12); }
.nr-action-icon.tone-orange,
.nr-action-icon.tone-amber { color: var(--nr-orange); background: rgba(249, 115, 22, 0.12); }
.nr-action-icon.tone-blue { color: var(--nr-blue); background: rgba(59, 130, 246, 0.12); }
.nr-action-copy { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.nr-action-label {
  font-size: 0.9rem;
  font-weight: 800;
  line-height: 1.2;
}
.nr-action-desc {
  font-size: 0.74rem;
  color: #64748b;
  line-height: 1.3;
}
.nr-action-chevron {
  font-size: 1.25rem;
  font-weight: 700;
  color: inherit;
  opacity: 0.75;
}
.nr-empty-actions {
  font-size: 0.85rem;
  color: #64748b;
  padding: 8px 4px;
}
.nr-tip {
  margin-top: 14px;
  display: flex;
  gap: 10px;
  padding: 11px 12px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid var(--nr-line);
}
.nr-tip-icon { color: var(--nr-muted); flex: 0 0 auto; margin-top: 1px; }
.nr-tip-title { font-size: 0.75rem; font-weight: 800; color: #475569; }
.nr-tip-text { margin: 2px 0 0; font-size: 0.74rem; color: var(--nr-muted); line-height: 1.4; }
.nr-main {
  padding: 18px 20px 12px;
  overflow-y: auto;
  max-height: min(70vh, 640px);
  background: #fff;
}
.nr-main .lbl {
  color: #334155;
}
.nr-main .input,
.nr-main select.input,
.modal--new-request .input,
.modal--new-request select.input {
  color: #0f172a;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
  line-height: 1.35;
}
.nr-main select.input option,
.modal--new-request select.input option {
  color: #0f172a;
  background: #fff;
}
.nr-field { margin-top: 14px; }
.nr-field:first-child { margin-top: 0; }
.nr-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.nr-input-icon {
  position: absolute;
  left: 12px;
  color: var(--nr-grey);
  display: inline-flex;
  pointer-events: none;
}
.nr-input { padding-left: 36px !important; }
.nr-help { margin-top: 6px; font-size: 12px; }
.nr-warn {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fff7ed;
  border: 1px solid #fdba74;
  color: #9a3412;
  font-size: 0.85rem;
}
.nr-info-banner {
  margin-bottom: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(6, 182, 212, 0.08);
  border: 1px solid rgba(6, 182, 212, 0.22);
  color: #0f766e;
  font-size: 0.86rem;
  line-height: 1.4;
}
.nr-modality-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.nr-modality {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 12px;
  padding: 12px 10px;
  font-weight: 800;
  color: #334155;
  cursor: pointer;
}
.nr-modality.on {
  background: rgba(79, 70, 229, 0.08);
  border-color: var(--nr-purple);
  color: var(--nr-purple-deep);
  box-shadow: none;
}
.nr-notes-wrap { position: relative; }
.nr-notes { resize: vertical; min-height: 72px; padding-bottom: 26px !important; }
.nr-notes-count {
  position: absolute;
  right: 10px;
  bottom: 8px;
  font-size: 11px;
  font-weight: 700;
  color: var(--nr-grey);
}
.nr-summary {
  margin-top: 16px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--nr-soft);
  border: 1px solid var(--nr-line);
}
.nr-summary-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  color: var(--nr-ink);
  margin-bottom: 10px;
  font-size: 0.9rem;
}
.nr-summary-grid {
  display: grid;
  gap: 8px;
  margin: 0;
}
.nr-summary-grid > div {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 8px;
  font-size: 0.86rem;
}
.nr-summary-grid dt {
  margin: 0;
  color: var(--nr-muted);
  font-weight: 650;
}
.nr-summary-grid dd {
  margin: 0;
  color: var(--nr-ink);
  font-weight: 700;
  overflow-wrap: anywhere;
}
.nr-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px 16px;
  border-top: 1px solid var(--nr-line);
  background: var(--nr-soft);
}
.nr-btn-cancel {
  min-width: 96px;
}
.nr-btn-submit {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 148px;
  justify-content: center;
  background: #166534 !important;
  border-color: transparent !important;
  color: #fff !important;
  font-weight: 800;
  border-radius: 10px;
  box-shadow: 0 6px 16px rgba(22, 101, 52, 0.22);
}
.nr-btn-submit:hover:not(:disabled) {
  filter: brightness(1.05);
  transform: translateY(-1px);
}
.nr-btn-submit:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}
@media (max-width: 820px) {
  .nr-layout {
    grid-template-columns: 1fr;
  }
  .nr-sidebar {
    border-right: none;
    border-bottom: 1px solid var(--nr-line);
    max-height: none;
  }
  .nr-main {
    max-height: none;
  }
  .sched-chrome-top {
    flex-direction: column;
    align-items: stretch;
  }
  .sched-chrome-nav {
    width: 100%;
  }
}

/* Supervision video modal – larger, with logo and fullscreen */
.supv-video-backdrop .supv-video-modal {
  max-width: min(95vw, 1400px);
  width: min(95vw, 1400px);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.supv-video-backdrop .supv-video-modal.supv-video-fullscreen {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  max-width: none;
  max-height: none;
  border-radius: 0;
  z-index: 10002;
}
.supv-video-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.supv-video-head-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}
.supv-video-logo {
  flex-shrink: 0;
}
.supv-video-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
@media (min-width: 768px) {
  .modal--request {
    max-height: calc(100vh - 32px);
  }
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.modal-title {
  font-weight: 900;
}
.modal-body {
  margin-top: 10px;
}
.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.action-chip {
  border: 1px solid rgba(148, 163, 184, 0.36);
  border-radius: 14px;
  padding: 12px;
  text-align: left;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.54));
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
  transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease, background 140ms ease;
}
.action-chip:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.13);
}
.action-chip.on {
  border-color: rgba(30, 64, 175, 0.55);
  box-shadow: inset 0 0 0 1px rgba(30, 64, 175, 0.22), 0 12px 26px rgba(30, 64, 175, 0.17);
  background: linear-gradient(155deg, rgba(239, 246, 255, 0.9), rgba(224, 242, 254, 0.75));
}
.action-chip:disabled {
  opacity: 0.62;
  cursor: not-allowed;
}
.action-chip-label {
  font-weight: 800;
  letter-spacing: 0.01em;
}
.action-chip-note {
  font-size: 12px;
  color: rgba(51, 65, 85, 0.92);
}
.action-chip.tone-blue {
  border-color: rgba(37, 99, 235, 0.35);
  background: linear-gradient(145deg, rgba(239, 246, 255, 0.95), rgba(219, 234, 254, 0.85));
}
.action-chip.tone-teal {
  border-color: rgba(13, 148, 136, 0.35);
  background: linear-gradient(145deg, rgba(240, 253, 250, 0.95), rgba(204, 251, 241, 0.85));
}
.action-chip.tone-cyan {
  border-color: rgba(8, 145, 178, 0.35);
  background: linear-gradient(145deg, rgba(236, 254, 255, 0.95), rgba(207, 250, 254, 0.85));
}
.action-chip.tone-green {
  border-color: rgba(22, 163, 74, 0.35);
  background: linear-gradient(145deg, rgba(240, 253, 244, 0.95), rgba(220, 252, 231, 0.85));
}
.action-chip.tone-indigo {
  border-color: rgba(79, 70, 229, 0.35);
  background: linear-gradient(145deg, rgba(238, 242, 255, 0.95), rgba(224, 231, 255, 0.85));
}
.action-chip.tone-violet {
  border-color: rgba(124, 58, 237, 0.35);
  background: linear-gradient(145deg, rgba(245, 243, 255, 0.95), rgba(237, 233, 254, 0.85));
}
.action-chip.tone-amber {
  border-color: rgba(217, 119, 6, 0.35);
  background: linear-gradient(145deg, rgba(255, 251, 235, 0.95), rgba(254, 243, 199, 0.85));
}
.action-chip.tone-rose {
  border-color: rgba(225, 29, 72, 0.35);
  background: linear-gradient(145deg, rgba(255, 241, 242, 0.95), rgba(254, 226, 226, 0.85));
}
.action-chip.tone-red {
  border-color: rgba(220, 38, 38, 0.4);
  background: linear-gradient(145deg, rgba(254, 242, 242, 0.98), rgba(254, 202, 202, 0.9));
}
.action-chip.tone-sky {
  border-color: rgba(14, 165, 233, 0.4);
  background: linear-gradient(145deg, rgba(240, 249, 255, 0.98), rgba(224, 242, 254, 0.9));
}
.action-chip.tone-emerald {
  border-color: rgba(5, 150, 105, 0.4);
  background: linear-gradient(145deg, rgba(236, 253, 245, 0.98), rgba(209, 250, 229, 0.9));
}
.action-chip.tone-orange {
  border-color: rgba(234, 88, 12, 0.4);
  background: linear-gradient(145deg, rgba(255, 247, 237, 0.98), rgba(255, 237, 213, 0.9));
}
.action-chip.tone-slate {
  border-color: rgba(100, 116, 139, 0.35);
  background: linear-gradient(145deg, rgba(248, 250, 252, 0.95), rgba(241, 245, 249, 0.85));
}
.participant-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.participant-scroll {
  max-height: 320px;
  overflow: auto;
  padding-right: 2px;
}
.participant-card {
  border: 1px solid rgba(148, 163, 184, 0.36);
  border-radius: 12px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.72);
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
}
.participant-card--rich {
  flex-direction: row;
  align-items: center;
  gap: 10px;
}
.participant-face {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  object-fit: cover;
  flex: 0 0 36px;
  background: #e2e8f0;
}
.participant-face--initials {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(135deg, #6366f1, #2563eb);
}
.participant-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.participant-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
}
.participant-card.on {
  border-color: rgba(37, 99, 235, 0.56);
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.2);
  background: rgba(239, 246, 255, 0.88);
}
.participant-name {
  font-weight: 700;
}
.participant-role {
  font-size: 12px;
  color: rgba(71, 85, 105, 0.92);
  text-transform: capitalize;
}
.modal--stack-details {
  max-width: min(720px, 100%);
  --nr-ink: #0f172a;
  --nr-muted: #64748b;
  --nr-line: #e8eef5;
  --nr-soft: #f8fafc;
  color: #0f172a;
  background: #fff;
}
.modal--stack-details .stack-details-body {
  max-height: min(78vh, 720px);
}
.modal--stack-details .stack-details-static {
  border: 1px solid #e8eef5;
  background: #fff;
  border-radius: 14px;
  padding: 14px;
}
.modal--stack-details .stack-details-kind {
  color: #64748b;
}
.modal--stack-details .stack-details-label {
  font-size: 1.15rem;
  font-weight: 800;
  color: #0f172a;
}
.modal--stack-details .stack-details-sub {
  margin-top: 4px;
  font-size: 0.9rem;
  font-weight: 650;
  color: #475569;
}
.modal--stack-details .stack-details-edit {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid #e8eef5;
}
.modal--stack-details .nr-info-bar {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: 0;
  border: 1px solid #e8eef5;
  border-radius: 14px;
  background: #fff;
  margin: 10px 0 12px;
  overflow: visible;
}
.modal--stack-details .nr-info-cell {
  padding: 12px 14px;
  border-right: 1px solid #e8eef5;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.modal--stack-details .nr-info-cell:last-child { border-right: none; }
.modal--stack-details .nr-info-label {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
}
.modal--stack-details .nr-info-value {
  font-size: 0.88rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.3;
}
.modal--stack-details .nr-info-select,
.modal--stack-details .nr-appt-input,
.modal--stack-details input.input,
.modal--stack-details select.input,
.modal--stack-details textarea.input {
  width: 100%;
  border: 1px solid #e8eef5 !important;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.85rem;
  font-weight: 650;
  background: #f8fafc !important;
  color: #0f172a !important;
  color-scheme: light;
}
.modal--stack-details .nr-when-edit--stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.modal--stack-details .nr-when-edit--stack .nr-when-sep {
  display: none;
}
.modal--stack-details .nr-appt-edit-actions {
  margin-top: 14px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.modal--stack-details .nr-tz-under {
  font-size: 0.72rem;
  font-weight: 600;
  color: #94a3b8;
}
@media (max-width: 700px) {
  .modal--stack-details .nr-info-bar {
    grid-template-columns: 1fr;
  }
  .modal--stack-details .nr-info-cell {
    border-right: none;
    border-bottom: 1px solid #e8eef5;
  }
  .modal--stack-details .nr-info-cell:last-child { border-bottom: none; }
}
.supervision-selected-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.supervision-chip {
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 999px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.9);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: rgba(30, 41, 59, 0.96);
  cursor: pointer;
}
.supervision-chip.primary {
  border-color: rgba(37, 99, 235, 0.45);
  background: rgba(239, 246, 255, 0.96);
}
.modern-help {
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 12px;
  padding: 9px 11px;
  background: rgba(255, 255, 255, 0.64);
  color: var(--text-secondary);
  font-size: 13px;
}
.lbl {
  display: block;
  font-weight: 800;
  margin-bottom: 6px;
}
.input {
  width: 100%;
}
.modal-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
@media (max-width: 640px) {
  .field-grid {
    grid-template-columns: 1fr;
  }
  .action-grid {
    grid-template-columns: 1fr;
  }
  .participant-grid {
    grid-template-columns: 1fr;
  }
  .office-quick-glance-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}

@media (max-width: 860px) {
  .sched-toolbar-main {
    flex-wrap: wrap;
  }
  .sched-toolbar-left,
  .sched-toolbar-right {
    flex-wrap: wrap;
  }
}
.agenda-draft-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.agenda-draft-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  background: #f9fafb;
  border-radius: 6px;
  margin-bottom: 4px;
  font-size: 13px;
}
.agenda-draft-list .btn-ghost {
  background: none;
  border: none;
  color: #6b7280;
  cursor: pointer;
  padding: 2px 6px;
  font-size: 12px;
}
.agenda-draft-list .btn-ghost:hover {
  color: #1f2937;
}

/* Read-only slot info modal (regular user viewing another's booking) */
.modal--slot-info {
  max-width: 380px;
}
.slot-info-card {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.slot-info-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.slot-info-label {
  min-width: 90px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
}
.slot-info-value {
  font-size: 15px;
  color: #111827;
}
.slot-info-value--provider {
  font-weight: 600;
  color: #166534;
}
.slot-info-status {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.slot-info-status--assigned_booked { background: #fee2e2; color: #991b1b; }
.slot-info-status--assigned_available { background: #dcfce7; color: #166534; }
.slot-info-status--assigned_temporary { background: #fef3c7; color: #92400e; }
.slot-info-status--open { background: #f3f4f6; color: #374151; }

/* Admin slot info header inside the request modal */
.modal--new-request .admin-slot-info-header {
  margin: 0 20px;
  border-radius: 0;
  border-left: none;
  border-right: none;
}
.admin-slot-info-header {
  margin: 10px 0 6px;
  padding: 10px 14px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
}
.admin-slot-info-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 14px;
}
.admin-slot-info-icon {
  font-size: 16px;
}
.admin-slot-info-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: #dcfce7;
  color: #166534;
}
.admin-slot-info-pill--mode {
  background: #dbeafe;
  color: #1d4ed8;
}
.admin-slot-info-pill--type {
  background: #f3e8ff;
  color: #7e22ce;
}
.admin-slot-info-dates {
  margin-top: 4px;
  font-size: 12px;
  color: #6b7280;
}
.admin-slot-info-block-note {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.35;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
}
.admin-slot-info-block-note.is-partial {
  background: #fff7ed;
  border-color: #fdba74;
  color: #9a3412;
}
.slot-details-panel {
  margin-top: 4px;
}
.slot-details-lead {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 4px;
  line-height: 1.4;
}

/* Admin assign inline form */
.book-slot-help {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 13px;
  color: #1e40af;
  line-height: 1.5;
  margin-bottom: 10px;
}
.cb-form {
  margin-top: 14px;
  padding: 14px;
  background: #fff5f5;
  border: 1px solid #fecaca;
  border-radius: 8px;
}
.cb-info {
  font-size: 14px;
  margin-bottom: 12px;
  color: #374151;
}
.cb-scope-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cb-scope-row .check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1.4;
}
.cb-scope-row .check input[type="radio"] {
  margin-top: 2px;
  flex-shrink: 0;
}
.btn-danger {
  background: #dc2626;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.btn-danger:hover:not(:disabled) { background: #b91c1c; }
.btn-danger:disabled { opacity: 0.6; cursor: not-allowed; }

.aa-form {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
}
.aa-room-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #1f2937;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
}
.aa-room-label { font-weight: 700; color: #475569; }
.aa-field {
  margin-top: 12px;
}
.aa-time-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.aa-input {
  width: 100%;
  display: block;
  color: #0f172a !important;
  background: #fff !important;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
  line-height: 1.35;
}
.aa-input:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}
.aa-mode-block {
  margin-top: 12px;
}
.aa-mode-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.aa-mode-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  text-align: left;
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #0f172a;
  cursor: pointer;
  transition: border-color 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
}
.aa-mode-card:hover {
  border-color: #c7d2fe;
  background: #fafafe;
}
.aa-mode-card.on {
  border-color: transparent;
  background: #eef2ff;
  box-shadow: 0 0 0 2px #6366f1;
}
.aa-mode-card-title {
  font-size: 13px;
  font-weight: 800;
  line-height: 1.25;
  color: #0f172a;
}
.aa-mode-card.on .aa-mode-card-title {
  color: #3730a3;
}
.aa-mode-card-desc {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
  color: #64748b;
}
.aa-person-field {
  position: relative;
}
.aa-person-search-wrap {
  position: relative;
}
.aa-has-selection {
  border-color: #16a34a !important;
}
.aa-person-dropdown {
  position: absolute;
  z-index: 200;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 240px;
  overflow-y: auto;
}
.aa-person-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9px 12px;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: #0f172a;
  gap: 8px;
}
.aa-person-option:hover,
.aa-person-option--selected { background: #f0fdf4; }
.aa-role-badge {
  font-size: 11px;
  color: #64748b;
  background: #f1f5f9;
  padding: 2px 7px;
  border-radius: 4px;
  white-space: nowrap;
}
.aa-selected-person {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  font-size: 13px;
  color: #166534;
  font-weight: 600;
}
.aa-selected-person-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.aa-clear-person {
  flex-shrink: 0;
  background: #fff;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  cursor: pointer;
  color: #166534;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  padding: 5px 8px;
}
.aa-clear-person:hover {
  color: #b91c1c;
  border-color: #fecaca;
  background: #fef2f2;
}
.aa-weekday-row {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.aa-weekday-check {
  padding: 5px 10px;
  border-radius: 4px;
  border: 1px solid #d1d5db;
  cursor: pointer;
  font-size: 13px;
  user-select: none;
  background: #f9fafb;
  color: #374151;
  transition: background 0.12s, color 0.12s;
}
.aa-weekday-check.on {
  background: #15803d;
  color: #fff;
  border-color: #15803d;
}
.aa-temp-check {
  display: inline-flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  line-height: 1.35;
}
.aa-temp-check input {
  margin-top: 2px;
  flex-shrink: 0;
}

/* Plot Twist HQ embed + app dark mode (`data-theme="dark"`) */
.sched-wrap--dark {
  --sched-ink: #f8fafc;
  --sched-muted: #cbd5e1;
  --sched-line: rgba(148, 163, 184, 0.18);
  --sched-soft: rgba(15, 23, 42, 0.88);
  --sched-today: rgba(139, 92, 246, 0.24);
  --border: rgba(148, 163, 184, 0.28);
  --bg-alt: rgba(15, 23, 42, 0.78);
  --bg-card: rgba(17, 24, 39, 0.92);
  --text: #f8fafc;
  --text-primary: #f8fafc;
  --text-secondary: #cbd5e1;
  color: var(--sched-ink);
}
.sched-wrap--dark .sched-page-title {
  color: #f8fafc;
}
.sched-wrap--dark .sched-page-sub {
  color: #cbd5e1;
}
.sched-wrap--dark .sched-week-range {
  color: #cbd5e1;
}
.sched-wrap--dark .sched-nav-btn,
.sched-wrap--dark .sched-nav-icon-btn,
.sched-wrap--dark .sched-nav-view-pill,
.sched-wrap--dark .sched-icon-btn {
  border-color: rgba(148, 163, 184, 0.24);
  background: rgba(15, 23, 42, 0.82);
  color: #e2e8f0;
}
.sched-wrap--dark .sched-nav-btn:hover:not(:disabled),
.sched-wrap--dark .sched-nav-icon-btn:hover:not(:disabled) {
  background: rgba(139, 92, 246, 0.18);
  border-color: rgba(167, 139, 250, 0.42);
  color: #f5f3ff;
}
.sched-wrap--dark .sched-span-switch {
  border-color: rgba(148, 163, 184, 0.24);
  background: rgba(15, 23, 42, 0.72);
}
.sched-wrap--dark .sched-span-btn {
  color: #cbd5e1;
}
.sched-wrap--dark .sched-span-btn.on {
  background: rgba(139, 92, 246, 0.28);
  color: #ffffff;
  box-shadow: inset 0 0 0 1px rgba(167, 139, 250, 0.28);
}
.sched-wrap--dark .sched-tool-cluster {
  border-color: rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.72);
}
.sched-wrap--dark .sched-tool-cluster__label,
.sched-wrap--dark .sched-more-tools__summary,
.sched-wrap--dark .sched-toggle,
.sched-wrap--dark .peer-busy-details,
.sched-wrap--dark .peer-busy-item {
  color: #cbd5e1;
}
.sched-wrap--dark .sched-pill,
.sched-wrap--dark .sched-chip {
  border-color: rgba(148, 163, 184, 0.28);
  background: rgba(15, 23, 42, 0.78);
  color: #e2e8f0;
}
.sched-wrap--dark .sched-pill.on {
  background: rgba(139, 92, 246, 0.26);
  border-color: rgba(196, 181, 253, 0.48);
  color: #ede9fe;
}
.sched-wrap--dark .sched-pill--emphasis {
  border-color: rgba(96, 165, 250, 0.42);
  color: #bfdbfe;
}
.sched-wrap--dark .sched-pill--emphasis.on {
  background: rgba(59, 130, 246, 0.22);
  color: #dbeafe;
}
.sched-wrap--dark .sched-chip.on {
  background: rgba(251, 146, 60, 0.16);
  border-color: rgba(251, 146, 60, 0.38);
  color: #fdba74;
}
.sched-wrap--dark .sched-view-switch {
  border-color: rgba(148, 163, 184, 0.24);
  background: rgba(15, 23, 42, 0.72);
}
.sched-wrap--dark .sched-seg {
  color: #cbd5e1;
}
.sched-wrap--dark .sched-seg.on {
  background: rgba(139, 92, 246, 0.28);
  color: #ffffff;
  box-shadow: inset 0 0 0 1px rgba(167, 139, 250, 0.28);
}
.sched-wrap--dark .sched-seg--back {
  background: rgba(59, 130, 246, 0.14);
  color: #93c5fd;
  border-color: rgba(96, 165, 250, 0.35);
}
.sched-wrap--dark .sched-seg--back:hover {
  background: rgba(59, 130, 246, 0.22);
  color: #bfdbfe;
  border-color: rgba(96, 165, 250, 0.45);
}
.sched-wrap--dark .sched-zoom-controls {
  border-color: rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.72);
}
.sched-wrap--dark .sched-more-tools[open] {
  border-color: rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.72);
}
.sched-wrap--dark .sched-select--compact,
.sched-wrap--dark select,
.sched-wrap--dark input[type="search"],
.sched-wrap--dark input[type="text"]:not([type="time"]) {
  border-color: rgba(148, 163, 184, 0.24);
  background: rgba(15, 23, 42, 0.82);
  color: #f1f5f9;
}
.sched-wrap--dark .sched-legend {
  color: #cbd5e1;
}
.sched-wrap--dark .sched-legend-chip {
  background: rgba(15, 23, 42, 0.78);
  border-color: rgba(148, 163, 184, 0.26);
  color: #e2e8f0;
}
.sched-wrap--dark .peer-busy-panel {
  background: rgba(15, 23, 42, 0.72);
  border-color: rgba(148, 163, 184, 0.26);
  color: #e2e8f0;
}
.sched-wrap--dark .sched-grid {
  border-color: rgba(148, 163, 184, 0.2);
  background: rgba(17, 24, 39, 0.92);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
}
.sched-wrap--dark .sched-head-cell,
.sched-wrap--dark .sched-hour,
.sched-wrap--dark .sched-cell {
  background: rgba(17, 24, 39, 0.92);
}
.sched-wrap--dark .sched-head-cell-day:hover {
  background: rgba(139, 92, 246, 0.12);
}
.sched-wrap--dark .sched-head-today,
.sched-wrap--dark .sched-cell-today {
  background: rgba(139, 92, 246, 0.14);
}
.sched-wrap--dark .sched-head-dow {
  color: #f8fafc;
}
.sched-wrap--dark .sched-head-date,
.sched-wrap--dark .sched-hour,
.sched-wrap--dark .sched-hour-quarter {
  color: #cbd5e1;
}
.sched-wrap--dark .sched-cell.clickable:hover {
  background: rgba(148, 163, 184, 0.08);
}
.sched-wrap--dark .cell-plus-btn {
  color: rgba(148, 163, 184, 0.55);
}
.sched-wrap--dark .sched-cell:hover .cell-plus-btn,
.sched-wrap--dark .sched-cell-selected .cell-plus-btn {
  color: #cbd5e1;
}
.sched-wrap--dark .cell-plus-btn:hover {
  background: rgba(139, 92, 246, 0.18);
  color: #e9d5ff;
}
.sched-wrap--dark .sched-day-timeline {
  border-color: rgba(148, 163, 184, 0.2);
  background: rgba(17, 24, 39, 0.92);
}
.sched-wrap--dark .sched-day-timeline__chip {
  border-color: rgba(148, 163, 184, 0.28);
  background: rgba(15, 23, 42, 0.78);
  color: #e2e8f0;
}
.sched-wrap--dark .sched-day-timeline__chip.on {
  background: rgba(139, 92, 246, 0.32);
  border-color: rgba(196, 181, 253, 0.48);
  color: #ffffff;
}
.sched-wrap--dark .sched-day-timeline__title {
  color: #f8fafc;
}
.sched-wrap--dark .sched-day-timeline__row {
  border-top-color: rgba(148, 163, 184, 0.18);
}
.sched-wrap--dark .sched-day-timeline__time {
  color: #cbd5e1;
}
.sched-wrap--dark .sched-day-card {
  background: rgba(15, 23, 42, 0.82);
}
.sched-wrap--dark .sched-day-card__title {
  color: #f8fafc;
}
.sched-wrap--dark .sched-day-card__meta {
  color: #cbd5e1;
}
.sched-wrap--dark .sched-day-timeline__add {
  border-color: rgba(148, 163, 184, 0.32);
  background: rgba(15, 23, 42, 0.78);
  color: #cbd5e1;
}
.sched-wrap--dark .selection-toolbar {
  border-color: rgba(148, 163, 184, 0.26);
  background: rgba(15, 23, 42, 0.82);
  color: #e2e8f0;
}
.sched-wrap--dark .muted {
  color: #cbd5e1;
}
/* Event blocks: lighter fills + light text on dark grid */
.sched-wrap--dark .cell-block {
  color: #f8fafc;
}
.sched-wrap--dark .cell-block-text {
  color: #f8fafc;
}
.sched-wrap--dark .cell-block-office-status {
  color: #e0e7ff;
}
.sched-wrap--dark .cell-block-office-empty {
  color: #cbd5e1;
}
.sched-wrap--dark .cell-block-office--reserved {
  background: var(--blockFill, rgba(147, 197, 253, 0.48));
  border-color: var(--blockBorder, rgba(147, 197, 253, 0.82));
}
.sched-wrap--dark .cell-block-office--reserved .cell-block-office-status {
  color: #dbeafe;
}
.sched-wrap--dark .cell-block-office--temp {
  background: var(--blockFill, rgba(253, 186, 116, 0.48));
  border-color: var(--blockBorder, rgba(251, 146, 60, 0.82));
}
.sched-wrap--dark .cell-block-office--temp .cell-block-office-status {
  color: #ffedd5;
}
.sched-wrap--dark .cell-block-office--booked {
  background: var(--blockFill, rgba(252, 165, 165, 0.50));
  border-color: var(--blockBorder, rgba(248, 113, 113, 0.85));
}
.sched-wrap--dark .cell-block-office--booked .cell-block-office-status {
  color: #fee2e2;
}
.sched-wrap--dark .cell-block-request {
  background: var(--blockFill, rgba(253, 224, 71, 0.42));
  border-color: var(--blockBorder, rgba(250, 204, 21, 0.72));
  color: #fef9c3;
}
.sched-wrap--dark .cell-block-school {
  background: var(--blockFill, rgba(147, 197, 253, 0.46));
  border-color: var(--blockBorder, rgba(96, 165, 250, 0.78));
  color: #eff6ff;
}
.sched-wrap--dark .cell-block-supv {
  background: var(--blockFill, rgba(216, 180, 254, 0.46));
  border-color: var(--blockBorder, rgba(192, 132, 252, 0.78));
  color: #faf5ff;
}
.sched-wrap--dark .cell-block-oa,
.sched-wrap--dark .cell-block-ot,
.sched-wrap--dark .cell-block-ob {
  color: #f8fafc;
}
.sched-wrap--dark .cell-block-peerbusy {
  color: #f8fafc;
}
.sched-wrap--dark .cell-block-sevt {
  background: var(--blockFill, rgba(110, 231, 183, 0.42));
  border-color: var(--blockBorder, rgba(52, 211, 153, 0.75));
  color: #ecfdf5;
}
.sched-wrap--dark .cell-block-intake-ip {
  background: rgba(134, 239, 172, 0.42);
  border-color: rgba(74, 222, 128, 0.72);
  color: #ecfdf5;
}
.sched-wrap--dark .cell-block-intake-vi {
  background: rgba(147, 197, 253, 0.46);
  border-color: rgba(96, 165, 250, 0.75);
  color: #eff6ff;
}
.sched-wrap--dark .cell-block-portal {
  background: rgba(153, 246, 228, 0.42);
  border-color: rgba(45, 212, 191, 0.72);
  color: #ecfdf5;
}
.sched-wrap--dark .cell-block-gbusy,
.sched-wrap--dark .cell-block-ebusy,
.sched-wrap--dark .cell-block-gevt {
  color: #f1f5f9;
}
.sched-wrap--dark .sched-day-card {
  color: #f8fafc;
}
</style>

