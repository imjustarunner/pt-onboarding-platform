<template>
  <div class="sched-wrap" :class="{ 'sched-wrap-quarter': showQuarterDetail }" :style="scheduleWrapVars" data-tour="my-schedule-grid">
    <div class="sched-toolbar" data-tour="my-schedule-toolbar">
      <div class="sched-toolbar-top" data-tour="my-schedule-week-nav">
        <h2 class="sched-week-title">Week of {{ weekStart }}</h2>
        <div class="sched-week-meta">
          <div class="sched-today-label">Today {{ todayMmdd }}</div>
          <button class="btn btn-secondary btn-sm sched-btn" type="button" @click="goToTodayWeek" :disabled="loading" data-tour="my-schedule-today-btn">
            Today
          </button>
        </div>
      </div>
      <div class="sched-toolbar-main">
        <div class="sched-toolbar-left" :class="{ 'sched-office-pulse': showOfficeReminderPulse }">
          <div class="sched-view-switch" role="tablist" aria-label="Schedule view" data-tour="my-schedule-view-switch">
            <button
              v-for="opt in viewModeOptions"
              :key="`view-${opt.id}`"
              type="button"
              class="sched-seg"
              role="tab"
              :aria-selected="String(viewMode === opt.id)"
              :class="{ on: viewMode === opt.id }"
              :disabled="loading"
              @click="viewMode = opt.id"
            >
              {{ opt.label }}
            </button>
          </div>
          <button class="btn btn-secondary btn-sm sched-btn" type="button" @click="prevWeek" :disabled="loading">← Prev</button>
          <button class="btn btn-secondary btn-sm sched-btn" type="button" @click="nextWeek" :disabled="loading">Next →</button>
        </div>

        <div v-if="officeReminderToast" class="sched-office-reminder-toast">
          {{ officeReminderToast }}
        </div>
        <div class="sched-toolbar-right">
          <label class="sched-inline" data-tour="my-schedule-office-select">
            <span>Office</span>
            <select v-model.number="selectedOfficeLocationId" class="sched-select" :disabled="loading || officeGridLoading">
              <option :value="0">None</option>
              <option v-for="o in officeLocations" :key="`sched-office-${o.id}`" :value="Number(o.id)">{{ o.name }}</option>
            </select>
          </label>

          <button
            v-if="selectedOfficeLocationId"
            class="sched-icon-btn"
            type="button"
            title="Clear office selection"
            :disabled="loading || officeGridLoading"
            @click="selectedOfficeLocationId = 0"
          >
            ✕
          </button>

          <button
            type="button"
            class="sched-pill"
            :class="{ on: showGoogleBusy }"
            role="switch"
            :aria-checked="String(!!showGoogleBusy)"
            :disabled="loading"
            @click="toggleGoogleBusy"
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
            title="Shows event titles (sensitive)"
            data-tour="my-schedule-google-titles-toggle"
          >
            Google titles
          </button>

          <button
            type="button"
            class="sched-pill"
            :class="{ on: hideWeekend }"
            role="switch"
            :aria-checked="String(!!hideWeekend)"
            :disabled="loading"
            @click="hideWeekend = !hideWeekend"
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
            title="Show 15-minute timing detail on event blocks"
          >
            15-min detail
          </button>

          <button
            type="button"
            class="sched-pill"
            :class="{ on: showExternalBusy }"
            role="switch"
            :aria-checked="String(!!showExternalBusy)"
            :disabled="loading || !externalCalendarsAvailable.length"
            @click="toggleExternalBusy"
            title="Show or hide Therapy Notes busy overlays"
          >
            Therapy Notes busy
          </button>

          <button
            v-if="!calendarsHidden"
            class="sched-pill"
            type="button"
            :disabled="loading"
            @click="hideAllCalendars"
            title="Hide all calendar overlays (keeps office overlay)"
            data-tour="my-schedule-hide-calendars"
          >
            Hide calendars
          </button>
          <button
            v-else
            class="sched-pill on"
            type="button"
            :disabled="loading"
            @click="showAllCalendars"
            title="Restore calendar overlays"
            data-tour="my-schedule-show-calendars"
          >
            Show calendars
          </button>

          <button class="btn btn-secondary btn-sm sched-btn" type="button" @click="load" :disabled="loading">Refresh</button>
        </div>
      </div>

      <div v-if="selectedOfficeLocationId && officeGridError" class="error" style="margin-top: 10px;">
        {{ officeGridError }}
      </div>
      <div v-else-if="selectedOfficeLocationId && officeGridLoading" class="loading" style="margin-top: 10px;">
        Loading office availability…
      </div>

      <div v-if="selectedOfficeLocationId && officeGrid && !officeGridLoading" class="office-quick-glance">
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

      <div class="sched-toolbar-secondary">
        <div class="sched-zoom-controls">
          <div class="sched-calendars-label">Day focus</div>
          <button
            v-for="d in focusableDays"
            :key="`focus-day-${d}`"
            type="button"
            class="sched-chip"
            :class="{ on: focusedDaySet.has(d) }"
            :disabled="loading"
            :title="focusedDaySet.has(d) ? `Remove ${d} focus` : `Focus ${d}`"
            @click="toggleFocusedDay(d, $event)"
          >
            {{ d.slice(0, 3) }}
          </button>
          <button
            type="button"
            class="sched-chip"
            :disabled="loading || !focusedDays.length"
            @click="clearFocusedDays"
            title="Return to full week view"
          >
            Full view
          </button>
          <label class="sched-inline compact" style="margin-left: 6px;">
            <span>Row height</span>
            <select v-model="rowHeightMode" class="sched-select compact">
              <option value="compact">Compact</option>
              <option value="normal">Normal</option>
              <option value="large">Large</option>
              <option value="xl">XL</option>
            </select>
          </label>
        </div>

        <div class="sched-calendars" data-tour="my-schedule-ehr-calendars">
          <div class="sched-calendars-label">Therapy Notes calendars</div>
          <div class="sched-calendars-actions">
            <button type="button" class="sched-chip" :disabled="loading || !externalCalendarsAvailable.length" @click="selectAllExternalCalendars">All</button>
            <button type="button" class="sched-chip" :disabled="loading || !externalCalendarsAvailable.length" @click="clearExternalCalendars">None</button>
          </div>
          <button
            v-for="c in externalCalendarsAvailable"
            :key="`cal-${c.id}`"
            type="button"
            class="sched-chip"
            :class="{ on: selectedExternalCalendarIds.includes(Number(c.id)) }"
            :disabled="loading || !showExternalBusy"
            @click="toggleExternalCalendar(Number(c.id))"
          >
            {{ c.label }}
          </button>
          <div v-if="!externalCalendarsAvailable.length" class="muted" style="font-size: 12px;">
            No Therapy Notes calendars connected for this provider.
          </div>
        </div>

        <div v-if="agencyFilterOptions.length > 1" class="sched-org-filters">
          <div class="sched-calendars-label">Agencies shown</div>
          <div class="sched-calendars-actions">
            <button type="button" class="sched-chip" :disabled="loading" @click="selectAllScheduleAgencies">All</button>
          </div>
          <button
            v-for="opt in agencyFilterOptions"
            :key="`org-chip-${opt.id}`"
            type="button"
            class="sched-chip"
            :class="{ on: activeScheduleAgencyIdSet.has(Number(opt.id)) }"
            :disabled="loading"
            @click="toggleScheduleAgencyFilter(Number(opt.id))"
            :title="activeScheduleAgencyIdSet.has(Number(opt.id)) ? 'Hide organization from schedule' : 'Show organization in schedule'"
          >
            {{ opt.label }}
          </button>
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
        <button class="btn btn-primary btn-sm" type="button" :disabled="supvMeetOpening" @click="joinPromptSessionNow">
          {{ supvMeetOpening ? 'Joining…' : 'Join now' }}
        </button>
        <button class="btn btn-secondary btn-sm" type="button" @click="dismissJoinPromptForSession(joinPromptSession.id)">
          Dismiss
        </button>
      </div>
    </div>

    <!-- Office layout view (room-by-room weekly board) -->
    <div v-if="viewMode === 'office_layout'" class="sched-grid-wrap" data-tour="my-schedule-office-layout-panel">
      <div v-if="!selectedOfficeLocationId" class="hint" style="margin-top: 10px;">
        Select an office above to view the room-by-room weekly layout.
      </div>
      <div v-else-if="officeGridError" class="error" style="margin-top: 10px;">{{ officeGridError }}</div>
      <div v-else-if="officeGridLoading" class="loading" style="margin-top: 10px;">Loading office availability…</div>
      <OfficeWeeklyRoomGrid
        v-else
        :office-grid="officeGrid"
        :today-ymd="todayLocalYmd"
        :can-book="canBookFromGrid"
        :selected-keys="selectedActionKeys"
        @cell-click="onOfficeLayoutCellClick"
      />
    </div>

    <!-- Open finder view (existing personal grid) -->
    <template v-else>
      <div v-if="error" class="error" style="margin-top: 10px;">{{ error }}</div>
      <div v-if="loading" class="loading" style="margin-top: 10px;">Loading schedule…</div>
      <div v-if="googleBusyDisabledHint" class="hint" style="margin-top: 10px;">
        {{ googleBusyDisabledHint }}
      </div>
      <div v-if="overlayErrorText" class="error" style="margin-top: 10px;">
        {{ overlayErrorText }}
      </div>

      <div v-else-if="summary" class="sched-grid-wrap">
      <div class="legend">
        <div class="legend-note muted" style="font-size: 11px; margin-bottom: 6px;">Block color = booking/event type; dot = agency</div>
        <div class="legend-item"><span class="swatch swatch-request"></span> Pending request</div>
        <div class="legend-item"><span class="swatch swatch-school"></span> School assigned</div>
        <div class="legend-item"><span class="swatch swatch-supv"></span> Supervision</div>
        <div class="legend-item"><span class="swatch swatch-sevt"></span> Schedule event</div>
        <div class="legend-item"><span class="swatch swatch-oa"></span> Office assigned</div>
        <div class="legend-item"><span class="swatch swatch-ot"></span> Office temporary</div>
        <div class="legend-item"><span class="swatch swatch-ob"></span> Office booked</div>
        <div class="legend-item"><span class="swatch swatch-intake-ip"></span> In-person intake</div>
        <div class="legend-item"><span class="swatch swatch-intake-vi"></span> Virtual intake</div>
        <div class="legend-item" v-if="showGoogleBusy"><span class="swatch swatch-gbusy"></span> Google busy</div>
        <div class="legend-item" v-if="showGoogleEvents"><span class="swatch swatch-gevt"></span> Google event</div>
        <div class="legend-item" v-if="showExternalBusy && selectedExternalCalendarIds.length"><span class="swatch swatch-ebusy"></span> Therapy Notes busy</div>
        <div class="legend-item"><span class="cell-block-agency-dot"></span> Agency marker</div>
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
            <div class="sched-head-dow">{{ d }}</div>
            <div class="sched-head-date">{{ dayDateLabel(d) }}</div>
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
              v-if="selectedOfficeLocationId && officeOverlay(d, slot.hour)"
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
                  b.segmentClass ? `cell-block-segment-${b.segmentClass}` : '',
                  { 'cell-block-hovered': isBlockHovered(d, slot.hour, b) }
                ]"
                :title="b.title"
                :style="cellBlockStyle(b)"
                @mouseenter="hoveredBlockKey = blockKey(d, slot.hour, b)"
                @mouseleave="hoveredBlockKey = ''"
                @click="onCellBlockClick($event, b, d, slot.hour)"
                @dblclick="onCellBlockDoubleClick($event, b, d, slot.hour)"
              >
                <span
                  v-if="hasAgencyBadge(b) && !b.hideAgencyDot"
                  class="cell-block-agency-dot"
                  :style="agencyBadgeStyle(b)"
                  :title="agencyBadgeTitle(b)"
                ></span>
                <span v-if="b.shortLabel" class="cell-block-text">{{ b.shortLabel }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
      </div>
    </template>

    <div v-if="showRequestModal" class="modal-backdrop modal-backdrop--request" @click.self="closeModal">
      <div class="modal modal--request">
        <div class="modal-head">
          <div class="modal-title">Request / book time</div>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeModal">Close</button>
        </div>

        <div class="muted" style="margin-top: 6px;">
          {{ modalDay }} • {{ modalTimeRangeLabel }}
        </div>

        <div class="modal-body">
          <div class="action-grid">
            <button
              v-for="act in visibleQuickActions"
              :key="`act-${act.id}`"
              type="button"
              class="action-chip"
              :class="[ `tone-${act.tone || 'slate'}`, { on: requestType === act.id } ]"
              :disabled="!!act.disabledReason"
              :title="act.disabledReason || act.description"
              @click="requestType = act.id; requestTypeChosenByUser = true"
            >
              <span class="action-chip-label">{{ act.label }}</span>
              <span v-if="act.disabledReason" class="action-chip-note">{{ act.disabledReason }}</span>
              <span v-else-if="act.description" class="action-chip-note">{{ act.description }}</span>
            </button>
          </div>
          <div v-if="!visibleQuickActions.length" class="modern-help" style="margin-top: 10px;">
            No actions are available for this slot. Choose an assigned/booked office slot or select an office from the toolbar.
          </div>
          <div v-if="requestType === 'school' && !canUseSchool(modalDay, modalHour, modalEndHour)" class="muted" style="margin-top: 6px;">
            School daytime availability must be on weekdays and between 06:00 and 18:00.
          </div>
          <div v-if="requestType === 'supervision' && supervisionProvidersLoading" class="muted" style="margin-top: 6px;">
            Loading providers…
          </div>
          <div v-if="requestType === 'supervision' && !supervisionProvidersLoading && availableSupervisionParticipants.length === 0" class="muted" style="margin-top: 6px;">
            No eligible supervisees are available in the selected supervision scope.
          </div>

          <div v-if="requestType === 'supervision' && availableSupervisionParticipants.length" style="margin-top: 10px;">
            <label class="lbl">Supervision type</label>
            <select v-model="supervisionSessionType" class="input" style="margin-bottom: 8px;">
              <option value="individual">Individual supervision</option>
              <option value="group">Group supervision</option>
            </select>
            <label v-if="supervisionCanUseAllAgencies" class="sched-toggle" style="margin-top: 8px; margin-bottom: 8px;">
              <input type="checkbox" v-model="supervisionIncludeAllAgencies" />
              <span>Show group supervisees from all my agencies</span>
            </label>
            <div class="muted" style="margin-top: 6px;">
              Individual supervision lists your direct supervisees in the selected agency. Group supervision lists all supervisees under supervision in the selected scope.
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
                class="participant-card"
                :class="{ on: Number(selectedSupervisionParticipantId || 0) === Number(p.id) }"
                @click="togglePrimarySupervisionParticipant(Number(p.id))"
              >
                <span class="participant-name">{{ supervisionParticipantLabel(p) }}</span>
                <span class="participant-role">{{ String(p.role || '').trim() || 'provider' }}</span>
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
              <div class="row" style="gap: 8px; margin-top: 6px; flex-wrap: wrap;">
                <button class="btn btn-secondary btn-sm" type="button" @click="selectAllFilteredSupervisionAdditionalParticipants">
                  Add all shown
                </button>
                <button class="btn btn-secondary btn-sm" type="button" @click="selectAllAvailableSupervisionAdditionalParticipants">
                  Add everyone in list
                </button>
                <button class="btn btn-secondary btn-sm" type="button" @click="clearSupervisionAdditionalParticipants">
                  Clear additional
                </button>
              </div>
              <div class="muted" style="margin-top: 6px;">
                Selected: {{ supervisionSelectedParticipantCount }} (primary + additional)
              </div>
              <div v-if="selectedSupervisionParticipantChips.length" class="supervision-selected-chips">
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
              <div class="participant-scroll" style="margin-top: 6px;">
                <div class="participant-grid">
                  <button
                    v-for="p in filteredSupervisionAdditionalParticipants"
                    :key="`supv-extra-${p.id}`"
                    type="button"
                    class="participant-card"
                    :class="{ on: selectedSupervisionAdditionalParticipantIdSet.has(Number(p.id)) }"
                    @click="toggleSupervisionAdditionalParticipant(Number(p.id))"
                  >
                    <span class="participant-name">{{ supervisionParticipantLabel(p) }}</span>
                    <span class="participant-role">{{ String(p.role || '').trim() || 'provider' }}</span>
                  </button>
                </div>
              </div>
              <div
                v-if="requestType === 'supervision' && supervisionSessionType === 'group' && supervisionSelectedParticipantCount < 2"
                class="muted"
                style="margin-top: 6px;"
              >
                Group supervision requires at least 2 participants.
              </div>
            </div>

            <label class="sched-toggle" style="margin-top: 8px;">
              <input type="checkbox" v-model="createSupervisionMeetLink" />
              <span>Create Google Meet link</span>
            </label>
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
          </div>

          <div v-if="requestType === 'agency_meeting'" style="margin-top: 10px;">
            <div v-if="meetingCandidatesLoading" class="muted" style="margin-top: 6px;">
              Loading agency participants…
            </div>
            <div v-else-if="!availableMeetingCandidates.length" class="muted" style="margin-top: 6px;">
              No meeting participants are available in this scope.
            </div>
            <label v-if="meetingCanUseAllAgencies" class="sched-toggle" style="margin-top: 8px; margin-bottom: 8px;">
              <input type="checkbox" v-model="meetingIncludeAllAgencies" />
              <span>Include participants from all my agencies</span>
            </label>
            <label class="lbl">Meeting participants</label>
            <input
              v-model="meetingParticipantSearch"
              class="input"
              type="text"
              placeholder="Search participants by name or email"
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
                Clear participants
              </button>
            </div>
            <div class="muted" style="margin-top: 6px;">
              Selected participants: {{ selectedMeetingParticipantIdSet.size }}
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
                  class="participant-card"
                  :class="{ on: selectedMeetingParticipantIdSet.has(Number(p.id)) }"
                  @click="toggleMeetingParticipant(Number(p.id))"
                >
                  <span class="participant-name">{{ supervisionParticipantLabel(p) }}</span>
                  <span class="participant-role">
                    {{ String(p.role || '').trim() || 'provider' }} • {{ meetingParticipantBusyText(p.id) }}
                  </span>
                </button>
              </div>
            </div>
            <div class="muted" style="margin-top: 6px;">
              Busy participants can still be invited, but they are marked above before booking.
            </div>
            <label class="sched-toggle" style="margin-top: 8px;">
              <input type="checkbox" v-model="createMeetingMeetLink" />
              <span>Create Google Meet link</span>
            </label>
            <div v-if="requestType === 'agency_meeting'" class="agenda-draft-section" style="margin-top: 12px;">
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

          <div v-if="requestType === 'office' || requestType === 'office_request_only' || requestType === 'individual_session' || requestType === 'group_session'" style="margin-top: 10px;">
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
              <label class="lbl">Frequency</label>
              <select v-model="officeBookingRecurrence" class="input">
                <option value="ONCE">Once</option>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Biweekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>

              <label v-if="['WEEKLY','BIWEEKLY','MONTHLY'].includes(officeBookingRecurrence)" class="lbl" style="margin-top: 10px;">Occurrences</label>
              <input
                v-if="['WEEKLY','BIWEEKLY','MONTHLY'].includes(officeBookingRecurrence)"
                v-model.number="officeBookingOccurrenceCount"
                type="number"
                min="1"
                :max="officeBookingRecurrence === 'WEEKLY' ? 6 : 104"
                class="input"
                style="margin-top: 4px; width: 80px;"
              />

              <template v-if="showClinicalBookingFields && isSessionBookingRequestType">
                <label class="lbl" style="margin-top: 10px;">Appointment type</label>
                <select v-model="bookingAppointmentType" class="input" :disabled="bookingMetadataLoading">
                  <option value="">Select type…</option>
                  <option v-for="opt in bookingTypeOptions" :key="`type-${opt.code}`" :value="opt.code">
                    {{ opt.label }}
                  </option>
                </select>

                <label class="lbl" style="margin-top: 10px;">Subtype (optional)</label>
                <select v-model="bookingAppointmentSubtype" class="input" :disabled="bookingMetadataLoading || !bookingSubtypeOptions.length">
                  <option value="">Optional subtype…</option>
                  <option v-for="opt in bookingSubtypeOptions" :key="`sub-${opt.code}`" :value="opt.code">
                    {{ opt.label }}
                  </option>
                </select>

                <label class="lbl" style="margin-top: 10px;">Service code</label>
                <select v-model="bookingServiceCode" class="input" :disabled="bookingMetadataLoading">
                  <option value="">Select service code…</option>
                  <option v-for="opt in bookingServiceCodeOptions" :key="`svc-${opt.code}`" :value="opt.code">
                    {{ opt.code }}{{ opt.label ? ` - ${opt.label}` : '' }}{{ serviceCodeOptionHints(opt) }}
                  </option>
                </select>

                <label class="lbl" style="margin-top: 10px;">Modality (optional)</label>
                <select v-model="bookingModality" class="input" :disabled="bookingMetadataLoading">
                  <option value="">Optional modality…</option>
                  <option value="IN_PERSON">In person</option>
                  <option value="TELEHEALTH">Telehealth</option>
                </select>
              </template>

              <label v-if="viewMode === 'office_layout'" class="lbl" style="margin-top: 10px;">Room</label>
              <div v-if="viewMode === 'office_layout' && officeGridLoading" class="muted">Loading rooms…</div>
              <div v-else-if="viewMode === 'office_layout' && officeGridError" class="error">{{ officeGridError }}</div>
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
              <div v-else-if="(requestType === 'office' || requestType === 'individual_session' || requestType === 'group_session') && viewMode === 'open_finder'" class="muted">Any open room will be used. Switch to Office layout for specific room selection.</div>
              <div v-if="showClinicalBookingFields && isSessionBookingRequestType && bookingMetadataLoading" class="muted" style="margin-top: 6px;">Loading appointment type and service code options…</div>
              <div v-else-if="bookingMetadataError" class="muted" style="margin-top: 6px;">{{ bookingMetadataError }}</div>
              <div v-if="showClinicalBookingFields && isSessionBookingRequestType && bookingClassificationInvalidReason" class="muted" style="margin-top: 6px;">
                {{ bookingClassificationInvalidReason }}
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

          <div v-if="actionRequiresAgency && actionAgencyOptions.length > 1" style="margin-top: 10px;">
            <label class="lbl">Agency for this action</label>
            <select v-model.number="selectedActionAgencyId" class="input">
              <option v-for="opt in actionAgencyOptions" :key="`action-agency-${opt.id}`" :value="Number(opt.id)">
                {{ opt.label }}
              </option>
            </select>
            <div class="muted" style="margin-top: 6px; font-size: 12px;">
              Schedule view can include multiple agencies; this chooses where the new item is created. For supervision groups, use the in-section all-agencies toggle to widen participant discovery.
            </div>
          </div>

          <div v-if="isScheduleEventRequestType" style="margin-top: 10px;">
            <div class="modern-help">
              Creates a calendar event for this provider. It appears in Google titles when enabled.
            </div>

            <label class="lbl" style="margin-top: 10px;">Event title</label>
            <input
              v-model="scheduleEventTitle"
              class="input"
              type="text"
              :placeholder="scheduleEventTitlePlaceholder"
              maxlength="200"
            />

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
          </div>

          <label class="lbl" style="margin-top: 10px;">End time</label>
          <select
            v-model.number="modalEndHour"
            class="input"
            :disabled="disableEndTimeInput"
          >
            <option v-for="h in endHourOptions" :key="`end-${h}`" :value="h">
              {{ hourLabel(h) }}
            </option>
          </select>

          <div v-if="canUseQuarterHourInput && !disableEndTimeInput" class="row" style="gap: 8px; margin-top: 8px;">
            <label class="sched-inline compact" style="flex: 1;">
              <span>Start min</span>
              <select v-model.number="modalStartMinute" class="sched-select compact">
                <option v-for="m in quarterMinuteOptions" :key="`start-min-${m}`" :value="m">
                  :{{ String(m).padStart(2, '0') }}
                </option>
              </select>
            </label>
            <label class="sched-inline compact" style="flex: 1;">
              <span>End min</span>
              <select v-model.number="modalEndMinute" class="sched-select compact">
                <option v-for="m in endMinuteOptions" :key="`end-min-${m}`" :value="m">
                  :{{ String(m).padStart(2, '0') }}
                </option>
              </select>
            </label>
          </div>

          <label class="lbl" style="margin-top: 10px;">Notes (optional)</label>
          <textarea v-model="requestNotes" class="input" rows="3" :placeholder="requestNotesPlaceholder" />

          <div v-if="modalError" class="error" style="margin-top: 10px;">{{ modalError }}</div>
        </div>

        <div v-if="!intakeConfirmStep" class="modal-actions">
          <button
            class="btn btn-primary"
            type="button"
            @click="submitRequest"
            :disabled="
              submitting ||
              !requestType ||
              ((requestType === 'office' || requestType === 'individual_session' || requestType === 'group_session') && (bookingMetadataLoading || !officeBookingValid || !!bookingClassificationInvalidReason)) ||
              (requestType === 'school' && !canUseSchool(modalDay, modalHour, modalEndHour)) ||
              (requestType === 'supervision' && !supervisionCanSubmit) ||
              (requestType === 'agency_meeting' && !meetingCanSubmit) ||
              ((requestType === 'intake_virtual_on' || requestType === 'intake_virtual_off' || requestType === 'intake_inperson_on' || requestType === 'intake_inperson_off') && !modalContext.officeEventId) ||
              (requestType === 'extend_assignment' && !(modalContext.standingAssignmentId > 0)) ||
              (requestType === 'forfeit_slot' && (!ackForfeit || !selectedActionContexts().some((x) => (Number(x?.officeEventId || 0) > 0 || Number(x?.standingAssignmentId || 0) > 0) && Number(x?.officeLocationId || 0) > 0))) ||
              (isScheduleEventRequestType && !scheduleEventCanSubmit)
            "
          >
            {{ submitting ? 'Submitting…' : submitActionLabel }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showSupvModal" class="modal-backdrop" @click.self="closeSupvModal">
      <div class="modal">
        <div class="modal-head">
          <div class="modal-title">Supervision session</div>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeSupvModal">Close</button>
        </div>

        <div v-if="supvModalError" class="error" style="margin-top: 10px;">{{ supvModalError }}</div>

        <div class="muted" style="margin-top: 6px;">
          {{ supvDayLabel }} • {{ hourLabel(supvStartHour) }}–{{ hourLabel(supvEndHour) }}
        </div>

        <div class="modal-body">
          <div v-if="supvOptions.length > 1" style="margin-bottom: 10px;">
            <label class="lbl">Session</label>
            <select v-model.number="selectedSupvSessionId" class="input">
              <option v-for="o in supvOptions" :key="`supv-opt-${o.id}`" :value="o.id">
                {{ o.label }}
              </option>
            </select>
          </div>

          <div class="field-grid">
            <div>
              <label class="lbl">Start</label>
              <input v-model="supvStartIsoLocal" class="input" type="datetime-local" />
            </div>
            <div>
              <label class="lbl">End</label>
              <input v-model="supvEndIsoLocal" class="input" type="datetime-local" />
            </div>
          </div>

          <div style="margin-top: 10px;">
            <label class="lbl">Notes</label>
            <textarea v-model="supvNotes" class="input" rows="4" placeholder="Optional notes for the Google Calendar description…" />
          </div>

          <div v-if="selectedSupvSession?.googleMeetLink" class="muted" style="margin-top: 8px;">
            <div>Meet link:</div>
            <a :href="selectedSupvSession.googleMeetLink" target="_blank" rel="noreferrer">
              {{ selectedSupvSession.googleMeetLink }}
            </a>
            <div style="margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap;">
              <button
                class="btn btn-primary btn-sm"
                type="button"
                :disabled="supvMeetOpening"
                @click="startTrackedSupvMeet"
              >
                {{ supvMeetOpening ? 'Joining…' : 'Join Meet (tracked)' }}
              </button>
              <a class="btn btn-secondary btn-sm" :href="selectedSupvSession.googleMeetLink" target="_blank" rel="noreferrer">
                Open in new tab
              </a>
            </div>
            <div class="muted" style="margin-top: 6px; font-size: 12px;">
              Starts in-app tracking for opened/closed meeting activity.
            </div>
          </div>
          <div v-else class="muted" style="margin-top: 8px;">
            <div>No Google Meet link is attached yet.</div>
            <div style="margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap;">
              <button
                class="btn btn-primary btn-sm"
                type="button"
                :disabled="supvSaving || !selectedSupvSessionId"
                @click="ensureSupvMeetLink"
              >
                {{ supvSaving ? 'Creating…' : 'Create Meet link' }}
              </button>
            </div>
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

          <label class="sched-toggle" style="margin-top: 10px;">
            <input type="checkbox" v-model="supvCreateMeetLink" />
            <span>Create Google Meet link (only if missing)</span>
          </label>

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

          <div class="modal-actions" style="justify-content: space-between;">
            <button class="btn btn-danger" type="button" @click="cancelSupvSession" :disabled="supvSaving || !selectedSupvSessionId">
              Cancel session
            </button>
            <button class="btn btn-primary" type="button" @click="saveSupvSession" :disabled="supvSaving || !selectedSupvSessionId">
              {{ supvSaving ? 'Saving…' : 'Save changes' }}
            </button>
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

    <div v-if="showStackDetailsModal" class="modal-backdrop" @click.self="closeStackDetailsModal">
      <div class="modal" style="max-width: 560px;">
        <div class="modal-head">
          <div class="modal-title">{{ stackDetailsTitle }}</div>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeStackDetailsModal">Close</button>
        </div>
        <div class="modal-body">
          <div v-if="!stackDetailsItems.length" class="muted">No overlapping details available for this block.</div>
          <div v-else class="stack-details-list">
            <button
              v-for="item in stackDetailsItems"
              :key="`stack-item-${item.id}`"
              class="stack-details-item"
              type="button"
              :disabled="!item.link && !item.sessionId && !item.googleEvent"
              @click="openStackDetailsItem(item)"
            >
              <div class="stack-details-label">{{ item.label }}</div>
              <div v-if="item.subLabel" class="stack-details-sub">{{ item.subLabel }}</div>
            </button>
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
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import api from '../../services/api';
import { getScheduleSummary, setScheduleSummary, invalidateScheduleSummaryCacheForUser } from '../../utils/scheduleSummaryCache';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { useUserPreferencesStore } from '../../store/userPreferences';
import OfficeWeeklyRoomGrid from './OfficeWeeklyRoomGrid.vue';
import MeetingAgendaPanel from '../meetings/MeetingAgendaPanel.vue';

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
  availabilityOverlay: { type: Object, default: null }
});
const emit = defineEmits(['update:weekStartYmd']);

const authStore = useAuthStore();
const agencyStore = useAgencyStore();

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

  const reqv = set(req, 0.35, 0.65);
  const schv = set(school, 0.28, 0.60);
  const supvv = set(supv, 0.20, 0.55);
  const oav = set(oa, 0.22, 0.55);
  const otv = set(ot, 0.24, 0.58);
  const obv = set(ob, 0.22, 0.58);
  const gbv = set(gb, 0.14, 0.42);
  const ebv = set(eb, 0.16, 0.45);

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
const hours = Array.from({ length: 15 }, (_, i) => 7 + i); // 7..21

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
const showQuarterDetail = ref(false);
const selectedExternalCalendarIds = ref([]); // populated from available list once loaded
let schedMouseUpHandler = null;
const hideWeekend = ref(props.mode === 'self');
const focusedDays = ref([]);
const rowHeightMode = ref('normal');
const initializedOverlayDefaults = ref(false);

const viewMode = ref('open_finder'); // 'open_finder' | 'office_layout' (office_layout implemented later)

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

const saveOverlayPrefs = () => {
  if (!overlayPrefsKey.value) return;
  try {
    const payload = {
      showGoogleBusy: !!showGoogleBusy.value,
      showGoogleEvents: !!showGoogleEvents.value,
      showExternalBusy: !!showExternalBusy.value,
      selectedExternalCalendarIds: coerceIdArray(selectedExternalCalendarIds.value),
      hideWeekend: !!hideWeekend.value,
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
  { id: 'open_finder', label: 'Open finder' },
  { id: 'office_layout', label: 'Click Here to navigate offices and request more office space' }
];

// Office reminder: pulse + 3s toast when user lands on My Schedule (self mode)
const showOfficeReminderPulse = ref(false);
const officeReminderToast = ref('');
const OFFICE_REMINDER_MSG = 'Click here to navigate offices and request more office space.';
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
        hasClinicalOrg: !!row?.hasClinicalOrg,
        hasLearningOrg: !!row?.hasLearningOrg
      });
    }
    selfScheduleAgencyOptions.value = deduped;
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
      selectedExternalCalendarIds.value = coerceIdArray(saved.selectedExternalCalendarIds);
      const dedicatedHideWeekend = loadHideWeekendPref();
      hideWeekend.value = dedicatedHideWeekend !== null
        ? dedicatedHideWeekend
        : (saved.hideWeekend !== undefined ? !!saved.hideWeekend : true);
      viewMode.value = saved.viewMode === 'office_layout' ? 'office_layout' : 'open_finder';
      lastCalendarPrefs.value = saved.lastCalendarPrefs ? { ...saved.lastCalendarPrefs } : null;
      // If saved selection is empty, we do NOT auto-select all — user explicitly hid calendars.
      shouldDefaultSelectAllExternal.value = false;
    } else {
      // First-load defaults (select-all external happens once calendars list is known).
      showGoogleBusy.value = true;
      showGoogleEvents.value = false;
      showExternalBusy.value = true;
      const dedicatedHideWeekend = loadHideWeekendPref();
      hideWeekend.value = dedicatedHideWeekend !== null ? dedicatedHideWeekend : true;
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
  const handleMouseUp = () => {
    const wasDragging = isCellDragSelecting.value;
    isCellDragSelecting.value = false;
    dragAnchorSlot.value = null;
    mouseDownCellKey.value = '';
    if (wasDragging) {
      nextTick(() => maybeAutoOpenSelectionActions());
      suppressClickAfterDrag.value = false;
    }
  };
  window.addEventListener('mouseup', handleMouseUp);
  schedMouseUpHandler = handleMouseUp;
  joinPromptNowMs.value = Date.now();
  joinPromptTimer = setInterval(() => {
    joinPromptNowMs.value = Date.now();
  }, 30000);
});

onUnmounted(() => {
  clearSupvMeetPolling();
  clearGevtClickTimer();
  clearDeferredLoad();
  if (joinPromptTimer) {
    clearInterval(joinPromptTimer);
    joinPromptTimer = null;
  }
  if (schedMouseUpHandler) {
    window.removeEventListener('mouseup', schedMouseUpHandler);
    schedMouseUpHandler = null;
  }
});

const orderedDays = computed(() => (String(props.weekStartsOn || '').toLowerCase() === 'sunday' ? SUNDAY_FIRST_DAYS : ALL_DAYS));
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
  if (!showQuarterDetail.value) {
    return hours.map((h) => ({
      key: `${h}:00`,
      hour: Number(h),
      minute: 0,
      label: hourLabel(h)
    }));
  }
  const slots = [];
  for (const h of hours) {
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

const dayDateLabel = (dayName) => {
  const idx = ALL_DAYS.indexOf(String(dayName || ''));
  if (idx < 0) return '';
  const ymd = addDaysYmd(weekStart.value, idx);
  // Use noon to avoid DST edge-cases around midnight.
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const weekStart = ref(startOfWeekMondayYmd(props.weekStartYmd || new Date()));

const isTodayDay = (dayName) => {
  const idx = ALL_DAYS.indexOf(String(dayName || ''));
  if (idx < 0) return false;
  const ymd = addDaysYmd(weekStart.value, idx);
  return ymd === todayLocalYmd.value;
};

const dayNameForDateYmd = (dateYmd) => {
  const g = officeGrid.value;
  const d = String(dateYmd || '').slice(0, 10);
  if (g && Array.isArray(g.days)) {
    const idx = g.days.findIndex((x) => String(x || '').slice(0, 10) === d);
    if (idx >= 0) return SUNDAY_FIRST_DAYS[idx] || null;
  }
  // Fallback: compute from weekStart (assumes same week; backend weekStart is Sunday)
  const ws = String(weekStart.value || '').slice(0, 10);
  const [y1, m1, d1] = ws.split('-').map(Number);
  const [y2, m2, d2] = d.split('-').map(Number);
  const a = new Date(y1, (m1 || 1) - 1, d1 || 1);
  const b = new Date(y2, (m2 || 1) - 1, d2 || 1);
  const diff = Math.floor((b - a) / (1000 * 60 * 60 * 24));
  return SUNDAY_FIRST_DAYS[diff] ?? null;
};

const onOfficeLayoutCellClick = ({ dateYmd, hour, roomId, slot, event }) => {
  if (!canBookFromGrid.value) return;
  const dn = dayNameForDateYmd(dateYmd);
  if (!dn) return;
  onCellClick(dn, Number(hour), event, { dateYmd, roomId, slot });
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

const agencyLabel = (agencyId) => {
  const id = Number(agencyId || 0);
  if (!id) return '';
  const local = (selfScheduleAgencyOptions.value || []).find((row) => Number(row?.id || 0) === id);
  if (local?.name) return String(local.name);
  const map = props.agencyLabelById && typeof props.agencyLabelById === 'object' ? props.agencyLabelById : null;
  const label = map ? map[String(id)] || map[id] : '';
  return String(label || '').trim();
};

const agencyFilterOptions = computed(() => {
  if (props.mode === 'self' && (selfScheduleAgencyOptions.value || []).length) {
    return selfScheduleAgencyOptions.value
      .map((row) => ({
        id: Number(row.id),
        label: String(row.name || `Agency ${row.id}`),
        hasClinicalOrg: !!row?.hasClinicalOrg,
        hasLearningOrg: !!row?.hasLearningOrg
      }))
      .filter((row) => Number.isFinite(row.id) && row.id > 0);
  }
  return propAgencyIds.value.map((id) => ({
    id: Number(id),
    label: agencyLabel(id) || `Agency ${id}`,
    hasClinicalOrg: agencyStore.currentAgency?.id === id ? !!agencyStore.currentAgency?.hasClinicalOrg : null,
    hasLearningOrg: agencyStore.currentAgency?.id === id ? !!agencyStore.currentAgency?.hasLearningOrg : null
  }));
});

const showClinicalBookingFields = computed(() => {
  const effId = Number(effectiveAgencyId.value || 0);
  if (!effId) return false;
  const opt = (agencyFilterOptions.value || []).find((r) => Number(r?.id) === effId);
  if (opt?.hasClinicalOrg === true) return true;
  if (opt?.hasClinicalOrg === false) return false;
  return !!agencyStore.currentAgency?.hasClinicalOrg && Number(agencyStore.currentAgency?.id) === effId;
});

const effectiveAgencyFeatureFlags = computed(() => {
  const effId = Number(effectiveAgencyId.value || 0);
  const opt = (agencyFilterOptions.value || []).find((r) => Number(r?.id) === effId);
  const fallbackMatches = Number(agencyStore.currentAgency?.id || 0) === effId;
  return {
    hasClinicalOrg: opt?.hasClinicalOrg === true || (opt?.hasClinicalOrg == null && fallbackMatches && !!agencyStore.currentAgency?.hasClinicalOrg),
    hasLearningOrg: opt?.hasLearningOrg === true || (opt?.hasLearningOrg == null && fallbackMatches && !!agencyStore.currentAgency?.hasLearningOrg)
  };
});

const actionAgencyOptions = computed(() => {
  const active = new Set((activeScheduleAgencyIds.value || []).map((n) => Number(n || 0)).filter((n) => n > 0));
  const rows = agencyFilterOptions.value.filter((row) => active.has(Number(row.id)));
  return rows.length ? rows : agencyFilterOptions.value;
});

const activeScheduleAgencyIdSet = computed(
  () => new Set((activeScheduleAgencyIds.value || []).map((n) => Number(n || 0)).filter((n) => n > 0))
);

const effectiveAgencyIds = computed(() => {
  if (props.mode === 'self' && agencyFilterOptions.value.length) {
    const active = (activeScheduleAgencyIds.value || []).map((n) => Number(n || 0)).filter((n) => n > 0);
    if (active.length) return Array.from(new Set(active));
    return agencyFilterOptions.value.map((row) => Number(row.id));
  }
  return propAgencyIds.value;
});

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
const canManageOffices = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return ['clinical_practice_assistant', 'provider_plus', 'admin', 'super_admin', 'superadmin', 'support', 'staff'].includes(role);
});
const currentUserRole = computed(() => String(authStore.user?.role || '').trim().toLowerCase());
const isSupervisorRole = computed(() => currentUserRole.value === 'supervisor');
const canScheduleSupervisionFromGrid = computed(() => {
  return isSupervisorRole.value;
});
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

  const dayIdx = ALL_DAYS.indexOf(String(dayName));
  if (dayIdx < 0) return '';
  const cellDate = addDaysYmd(weekStart.value, dayIdx);
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

const load = async ({ forceRefresh = false } = {}) => {
  if (!props.userId) return;
  if (!effectiveAgencyIds.value.length) {
    if (props.mode === 'self' && !selfScheduleAgenciesLoaded.value) {
      error.value = '';
      summary.value = null;
      return;
    }
    summary.value = null;
    error.value = props.mode === 'self'
      ? 'No organizations are attached to this account.'
      : 'Select an organization first.';
    return;
  }

  const ids = effectiveAgencyIds.value;
  const cacheKey = `${props.userId}|${[...ids].sort((a, b) => a - b).join(',')}|${weekStart.value}|${showGoogleBusy.value}|${showGoogleEvents.value}|${showExternalBusy.value}|${(selectedExternalCalendarIds.value || []).slice().sort((a, b) => a - b).join(',')}`;
  const cached = forceRefresh ? null : getScheduleSummary(cacheKey);
  if (cached) {
    summary.value = cached;
    error.value = '';
    loading.value = false;
  }

  try {
    if (!cached) loading.value = true;
    error.value = '';

    if (ids.length === 1) {
      const resp = await api.get(`/users/${props.userId}/schedule-summary`, {
        params: {
          weekStart: weekStart.value,
          agencyId: ids[0],
          includeGoogleBusy: showGoogleBusy.value ? 'true' : 'false',
          includeGoogleEvents: showGoogleEvents.value ? 'true' : 'false',
          ...(showExternalBusy.value && selectedExternalCalendarIds.value.length
            ? { externalCalendarIds: selectedExternalCalendarIds.value.join(',') }
            : {})
        }
      });
      summary.value = resp.data || null;
      setScheduleSummary(cacheKey, summary.value);
    } else {
      const results = await Promise.all(
        ids.map((agencyId) =>
          api
            .get(`/users/${props.userId}/schedule-summary`, {
              params: {
                weekStart: weekStart.value,
                agencyId,
                includeGoogleBusy: showGoogleBusy.value ? 'true' : 'false',
                includeGoogleEvents: showGoogleEvents.value ? 'true' : 'false',
                ...(showExternalBusy.value && selectedExternalCalendarIds.value.length
                  ? { externalCalendarIds: selectedExternalCalendarIds.value.join(',') }
                  : {})
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
        scheduleEvents: []
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
        const id = Number(e?.id || 0);
        if (id > 0) return `id:${id}`;
        return `sig:${String(e?.kind || '').toUpperCase()}|${String(e?.startAt || e?.startDate || '')}|${String(e?.endAt || e?.endDate || '')}|${String(e?.title || '')}`;
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
watch([() => props.userId, effectiveAgencyIds], deferredLoad, { immediate: true });
watch([showGoogleBusy, showGoogleEvents, showExternalBusy, selectedExternalCalendarIds], deferredLoad, { deep: true });

watch([() => props.mode, () => props.userId], () => {
  void loadSelfScheduleAgencies();
}, { immediate: true });

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
    if (!next) return;
    const monday = startOfWeekMondayYmd(next);
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
watch([showGoogleBusy, showGoogleEvents, showExternalBusy, selectedExternalCalendarIds, hideWeekend, viewMode], () => {
  if (props.mode !== 'self' || !overlayPrefsLoaded.value) return;
  saveOverlayPrefs();
}, { deep: true });

watch(hideWeekend, () => {
  if (props.mode !== 'self') return;
  saveHideWeekendPref();
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
    const idx = dayIndexForDateLocal(localYmd(startLocal), s.weekStart || weekStart.value);
    const dn = ALL_DAYS[idx] || null;
    if (dn !== dayName) continue;
    const cellDate = addDaysYmd(s.weekStart || weekStart.value, ALL_DAYS.indexOf(dayName));
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
    const idx = dayIndexForDateLocal(localYmd(startLocal), s.weekStart || weekStart.value);
    const dn = ALL_DAYS[idx] || null;
    if (dn !== dayName) continue;
    const cellDate = addDaysYmd(s.weekStart || weekStart.value, ALL_DAYS.indexOf(dayName));
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
    const idx = dayIndexForDateLocal(localYmd(startLocal), s.weekStart || weekStart.value);
    const dn = ALL_DAYS[idx] || null;
    if (dn !== dayName) continue;
    const cellDate = addDaysYmd(s.weekStart || weekStart.value, ALL_DAYS.indexOf(dayName));
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
    const idx = dayIndexForDateLocal(localYmd(startLocal), s.weekStart || weekStart.value);
    const dn = ALL_DAYS[idx] || null;
    if (dn !== dayName) continue;
    const cellDate = addDaysYmd(s.weekStart || weekStart.value, ALL_DAYS.indexOf(dayName));
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
  const dayIdx = ALL_DAYS.indexOf(String(dayName));
  if (dayIdx < 0) return [];
  const cellDate = addDaysYmd(ws, dayIdx);
  const cellStart = new Date(`${cellDate}T${pad2(hour)}:${pad2(minute)}:00`);
  const cellEnd = new Date(cellStart.getTime() + ((showQuarterDetail.value ? 15 : 60) * 60 * 1000));
  const list = Array.isArray(s.scheduleEvents) ? s.scheduleEvents : [];
  const hits = [];
  for (const ev of list) {
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
  const dayIdx = ALL_DAYS.indexOf(String(dayName));
  if (dayIdx < 0) return 'single';
  const ws = summary.value?.weekStart || weekStart.value;
  const cellDate = addDaysYmd(ws, dayIdx);
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
  const timing = quarterTimingFromRange(ev?.startAt, ev?.endAt);
  const withTiming = showQuarterDetail.value && timing ? `${timing} ${raw}` : raw;
  return withTiming.length > 22 ? `${withTiming.slice(0, 22)}…` : withTiming;
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
    const idx = dayIndexForDateLocal(localYmd(startLocal), s.weekStart || weekStart.value);
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
    const cellDate = addDaysYmd(ws, ALL_DAYS.indexOf(dayName));
    const cellStart = new Date(`${cellDate}T${pad2(hour)}:${pad2(minute)}:00`);
    const cellEnd = new Date(cellStart.getTime() + ((showQuarterDetail.value ? 15 : 60) * 60 * 1000));
    if (end > cellStart && start < cellEnd) return true;
  }
  return false;
};
const busyRangeForCell = (busyList, dayName, hour, ws, minute = 0) => {
  const dayIdx = ALL_DAYS.indexOf(String(dayName));
  if (dayIdx < 0) return null;
  const cellDate = addDaysYmd(ws, dayIdx);
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
  return hasBusyIntervals(s.googleBusy || [], dayName, hour, s.weekStart || weekStart.value, minute);
};

const googleEventsInCell = (dayName, hour, minute = 0) => {
  const s = summary.value;
  if (!s) return [];
  const ws = s.weekStart || weekStart.value;
  const dayIdx = ALL_DAYS.indexOf(String(dayName));
  if (dayIdx < 0) return [];
  const cellDate = addDaysYmd(ws, dayIdx);
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
  const cals = Array.isArray(s.externalCalendars) ? s.externalCalendars : [];
  for (const c of cals) {
    if (hasBusyIntervals(c?.busy || [], dayName, hour, s.weekStart || weekStart.value, minute)) return true;
  }
  return false;
};

const agenciesInCell = (kind, dayName, hour) => {
  const s = summary.value;
  if (!s) return [];
  const ws = s.weekStart || weekStart.value;
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
  const ws = s.weekStart || weekStart.value;
  const dayIdx = ALL_DAYS.indexOf(String(dayName));
  if (dayIdx < 0) return [];
  const cellDate = addDaysYmd(ws, dayIdx);
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

const officeTopEvent = (dayName, hour, officeIdFilter = null, roomIdFilter = null) => {
  let hits = officeEventsInCell(dayName, hour);
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

const supervisionSessionsInCell = (dayName, hour, minute = 0) => {
  const s = summary.value;
  if (!s) return [];
  const ws = s.weekStart || weekStart.value;
  const dayIdx = ALL_DAYS.indexOf(String(dayName));
  if (dayIdx < 0) return [];
  const cellDate = addDaysYmd(ws, dayIdx);
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
const externalBusyLabels = (dayName, hour) => {
  const s = summary.value;
  if (!s) return [];
  const cals = Array.isArray(s.externalCalendars) ? s.externalCalendars : [];
  const labels = [];
  for (const c of cals) {
    const label = String(c?.label || '').trim();
    if (!label) continue;
    if (hasBusyIntervals(c?.busy || [], dayName, hour, s.weekStart || weekStart.value)) labels.push(label);
  }
  return labels;
};
const externalBusyTitle = (dayName, hour) => {
  const labels = externalBusyLabels(dayName, hour);
  const suffix = labels.length ? ` (${labels.join(', ')})` : '';
  return `Therapy Notes busy${suffix} — ${dayName} ${hourLabel(hour)}`;
};

const firstExternalBusyQuarter = (dayName, hour) => {
  const s = summary.value;
  if (!s) return '';
  const cals = Array.isArray(s.externalCalendars) ? s.externalCalendars : [];
  const ws = s.weekStart || weekStart.value;
  const dayIdx = ALL_DAYS.indexOf(String(dayName));
  if (dayIdx < 0) return '';
  const cellDate = addDaysYmd(ws, dayIdx);
  const cellStart = new Date(`${cellDate}T${pad2(hour)}:00:00`);
  const cellEnd = new Date(`${cellDate}T${pad2(Number(hour) + 1)}:00:00`);
  let earliest = null;
  for (const cal of cals) {
    for (const b of cal?.busy || []) {
      const st = parseLocalDateTime(b?.startAt);
      const en = parseLocalDateTime(b?.endAt);
      if (!st || !en) continue;
      if (!(en > cellStart && st < cellEnd)) continue;
      if (!earliest || st < earliest) earliest = st;
    }
  }
  return earliest ? quarterClockLabel(earliest) : '';
};

const externalBusyShortLabel = (dayName, hour) => {
  const labels = externalBusyLabels(dayName, hour);
  const prefix = showQuarterDetail.value ? firstExternalBusyQuarter(dayName, hour) : '';
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

  // Office assignment state — one block per unique assignment (office is assigned to user, not agency)
  const selectedOfficeId = Number(selectedOfficeLocationId.value || 0);
  const officeHits = selectedOfficeId > 0
    ? officeEventsInCell(dayName, hour, minute).filter((e) => Number(e?.buildingId || 0) === selectedOfficeId)
    : [];
  const officeByAgency = new Map();
  for (const e of officeHits) {
    const aid = Number(e?._agencyId || 0) || null;
    const key = aid || 'none';
    if (!officeByAgency.has(key)) officeByAgency.set(key, []);
    officeByAgency.get(key).push(e);
  }
  for (const [, events] of officeByAgency) {
    const top = events.sort((a, b) => stateRank(b.slotState) - stateRank(a.slotState))[0] || null;
    const agencyId = Number(top?._agencyId || 0) || null;
    const buildingId = top?.buildingId ? Number(top.buildingId) : null;
    const roomId = top?.roomId ? Number(top.roomId) : null;
    const intakeSuffix = [
      top?.inPersonIntakeEnabled ? ' IP' : '',
      top?.virtualIntakeEnabled ? ' VI' : ''
    ].join('');
    const st = String(top?.slotState || '').toUpperCase();
    if (st === 'ASSIGNED_BOOKED') {
      blocks.push({ key: `office-booked-${agencyId || 'x'}`, kind: 'ob', shortLabel: shortOfficeLabel(top, 'Booked') + intakeSuffix, title: officeTitle(dayName, hour, top), buildingId, agencyId, roomId });
    } else if (st === 'ASSIGNED_TEMPORARY') {
      blocks.push({ key: `office-temp-${agencyId || 'x'}`, kind: 'ot', shortLabel: shortOfficeLabel(top, 'Temp') + intakeSuffix, title: officeTitle(dayName, hour, top), buildingId, agencyId, roomId });
    } else if (st === 'ASSIGNED_AVAILABLE') {
      blocks.push({ key: `office-assigned-${agencyId || 'x'}`, kind: 'oa', shortLabel: shortOfficeLabel(top, 'Office') + intakeSuffix, title: officeTitle(dayName, hour, top), buildingId, agencyId, roomId });
    }
  }
  const top = officeHits.sort((a, b) => stateRank(b.slotState) - stateRank(a.slotState))[0] || null;
  if (top?.inPersonIntakeEnabled) {
    blocks.push({ key: 'intake-ip', kind: 'intake-ip', shortLabel: 'IP', title: `In-person intake enabled — ${officeTitle(dayName, hour, top)}`, agencyId: Number(top?._agencyId || 0) || null, buildingId: top?.buildingId ? Number(top.buildingId) : null, roomId: top?.roomId ? Number(top.roomId) : null });
  }
  if (top?.virtualIntakeEnabled) {
    blocks.push({ key: 'intake-vi', kind: 'intake-vi', shortLabel: 'VI', title: `Virtual intake enabled — ${officeTitle(dayName, hour, top)}`, agencyId: Number(top?._agencyId || 0) || null, buildingId: top?.buildingId ? Number(top.buildingId) : null, roomId: top?.roomId ? Number(top.roomId) : null });
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
      shortLabel: showLabel ? scheduleEventShortLabel(ev) : '',
      title: scheduleEventBlockTitle(ev, dayName, hour),
      link: String(ev?.htmlLink || '').trim() || null,
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
      shortLabel: showLabel ? externalBusyShortLabel(dayName, hour) : '',
      title: externalBusyTitle(dayName, hour),
      segmentClass
    });
  }

  // Side-by-side if multiple; keep it readable: show at most 3 blocks, then "+N".
  if (!singleDayFocused && blocks.length > 3) {
    const extra = blocks.length - 2;
    return [
      blocks[0],
      blocks[1],
      { key: 'more', kind: 'more', shortLabel: `+${extra}`, title: `${extra} more items in this hour` }
    ];
  }
  return blocks;
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
  const dateYmd = addDaysYmd(weekStart.value, ALL_DAYS.indexOf(String(dayName || '')));
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
const modalDay = ref('Monday');
const modalHour = ref(7);
const modalEndHour = ref(8);
const modalStartMinute = ref(0);
const modalEndMinute = ref(0);
const requestType = ref(''); // selected action in request modal
const requestTypeChosenByUser = ref(false);
const modalActionSource = ref('general'); // general | plus_or_blank | office_block | other_block
const requestNotes = ref('');
const submitting = ref(false);
const modalError = ref('');
const SCHEDULE_EVENT_ACTIONS = new Set(['personal_event', 'schedule_hold', 'schedule_hold_all_day', 'indirect_services', 'agency_meeting']);
const AGENCY_OPTIONAL_ACTIONS = new Set([
  'office',
  'individual_session',
  'group_session',
  'unbook_slot',
  'forfeit_slot',
  'personal_event',
  'schedule_hold',
  'schedule_hold_all_day'
]);
const SCHEDULE_HOLD_REASON_OPTIONS = [
  { code: 'DOCUMENTATION', label: 'Documentation' },
  { code: 'TEAM_MEETING', label: 'Team meeting' },
  { code: 'TRAINING', label: 'Training' },
  { code: 'ADMIN', label: 'Administrative time' },
  { code: 'CUSTOM', label: 'Custom reason' }
];
const scheduleEventTitle = ref('');
const scheduleEventAllDay = ref(false);
const scheduleEventPrivate = ref(false);
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
  serviceCodes: []
});
const bookingAppointmentType = ref(DEFAULT_BOOKING_TYPE);
const bookingAppointmentSubtype = ref('');
const bookingServiceCode = ref('');
const bookingModality = ref('');
const modalContext = ref({
  officeEventId: null,
  officeLocationId: null,
  roomId: null,
  slotState: '',
  virtualIntakeEnabled: false,
  inPersonIntakeEnabled: false
});

const isHourlyWorker = computed(() => {
  const raw = authStore.user?.is_hourly_worker;
  return raw === true || raw === 1 || raw === '1';
});

const isScheduleEventRequestType = computed(() => SCHEDULE_EVENT_ACTIONS.has(String(requestType.value || '')));
const quarterMinuteOptions = [0, 15, 30, 45];
const isQuarterHourRequestType = computed(() => {
  const t = String(requestType.value || '');
  return ['supervision', 'agency_meeting', 'personal_event', 'schedule_hold', 'indirect_services'].includes(t);
});
const canUseQuarterHourInput = computed(
  () => isQuarterHourRequestType.value && !(isScheduleEventRequestType.value && scheduleEventAllDay.value)
);
const endMinuteOptions = computed(
  () => (Number(modalEndHour.value || 0) >= 22 ? [0] : quarterMinuteOptions)
);
const modalTimeRangeLabel = computed(() => {
  if (canUseQuarterHourInput.value) {
    return `${hourMinuteLabel(modalHour.value, modalStartMinute.value)}-${hourMinuteLabel(modalEndHour.value, modalEndMinute.value)}`;
  }
  return `${hourLabel(modalHour.value)}-${hourLabel(modalEndHour.value)}`;
});
const scheduleHoldReasonOptions = computed(() => SCHEDULE_HOLD_REASON_OPTIONS);
const scheduleEventTitlePlaceholder = computed(() => {
  const kind = String(requestType.value || '');
  if (kind === 'agency_meeting') return 'Agency meeting';
  if (kind === 'schedule_hold' || kind === 'schedule_hold_all_day') return 'Schedule hold';
  if (kind === 'indirect_services') return 'Indirect services';
  return 'Personal event';
});
const scheduleEventCanSubmit = computed(() => String(scheduleEventTitle.value || '').trim().length > 0);
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
  const supervisionOnlyMode = isViewingOtherUserSchedule.value;
  const hasClinicalOrLearningOrg = effectiveAgencyFeatureFlags.value.hasClinicalOrg || effectiveAgencyFeatureFlags.value.hasLearningOrg;
  return [
    {
      id: 'individual_session',
      label: 'Individual session',
      description: hasOffice ? 'Book individual session and office together' : 'Select office first',
      disabledReason: hasOffice ? '' : 'Select office',
      visible: !supervisionOnlyMode && hasClinicalOrLearningOrg,
      tone: 'sky'
    },
    {
      id: 'group_session',
      label: 'Group session',
      description: hasOffice ? 'Book group session and office together' : 'Select office first',
      disabledReason: hasOffice ? '' : 'Select office',
      visible: !supervisionOnlyMode && hasClinicalOrLearningOrg,
      tone: 'violet'
    },
    {
      id: 'office',
      label: 'Office booking',
      description: 'Mark assigned office slot as booked/busy',
      disabledReason: hasEvent && ['ASSIGNED_AVAILABLE', 'ASSIGNED_TEMPORARY'].includes(state)
        ? ''
        : 'Select an assigned office slot',
      visible: !supervisionOnlyMode && hasEvent && ['ASSIGNED_AVAILABLE', 'ASSIGNED_TEMPORARY'].includes(state),
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
      id: 'intake_virtual_on',
      label: 'Enable virtual intake',
      description: 'Auto-add virtual work hours if missing',
      disabledReason: hasEvent && !ctx.virtualIntakeEnabled ? '' : 'Needs assigned office slot',
      visible: hasEvent && !ctx.virtualIntakeEnabled,
      tone: 'cyan'
    },
    {
      id: 'intake_inperson_on',
      label: 'Enable in-person intake',
      description: 'Only on assigned office slots',
      disabledReason: hasEvent && hasAssignedOffice && !ctx.inPersonIntakeEnabled ? '' : 'Needs assigned office slot',
      visible: hasEvent && hasAssignedOffice && !ctx.inPersonIntakeEnabled,
      tone: 'green'
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
      label: 'Virtual availability (school)',
      description: 'Weekday daytime availability block',
      disabledReason: !isAdminMode.value && schoolWindowOk ? '' : 'Weekday 6AM-6PM only',
      visible: !supervisionOnlyMode && !isAdminMode.value,
      tone: 'indigo'
    },
    {
      id: 'supervision',
      label: 'Supervision',
      description: supervisionProvidersLoading.value ? 'Loading participants...' : 'Schedule individual supervision',
      disabledReason: !supervisionOptionVisible
        ? 'Supervisors only'
        : (supervisionProvidersLoading.value ? 'Loading providers' : ''),
      visible: supervisionOptionVisible,
      tone: 'violet'
    },
    {
      id: 'agency_meeting',
      label: 'Agency meeting',
      description: 'Schedule a meeting with one or more agency participants',
      disabledReason: '',
      visible: !supervisionOnlyMode,
      tone: 'teal'
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
      label: 'Indirect service time',
      description: isHourlyWorker.value ? 'Track indirect time for hourly work' : 'Use for hourly worker indirect service time',
      disabledReason: (isAdminMode.value || isHourlyWorker.value) ? '' : 'Hourly worker only',
      visible: !supervisionOnlyMode,
      tone: 'amber'
    },
    {
      id: 'booked_note',
      label: 'Write note',
      description: 'Open Note Aid with booking context',
      disabledReason: booked ? '' : 'Needs booked office slot',
      visible: !supervisionOnlyMode && booked,
      tone: 'amber'
    },
    {
      id: 'booked_record',
      label: 'Record session',
      description: 'Open Note Aid record-session mode',
      disabledReason: booked ? '' : 'Needs booked office slot',
      visible: !supervisionOnlyMode && booked,
      tone: 'rose'
    },
    {
      id: 'unbook_slot',
      label: 'Unbook slot',
      description: 'Return this to assigned office availability',
      disabledReason: hasEvent && booked ? '' : 'Needs booked office slot',
      visible: !supervisionOnlyMode && hasEvent && booked,
      tone: 'slate'
    },
    {
      id: 'forfeit_slot',
      label: 'Forfeit this slot',
      description: 'Release this assigned/booked slot to others',
      disabledReason: hasEvent ? '' : 'Needs assigned/booked slot',
      visible: !supervisionOnlyMode && (hasAssignedOffice || booked),
      tone: 'red'
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
  'supervision',
  'forfeit_slot',
  'extend_assignment',
  'intake_virtual_on',
  'intake_inperson_on',
  'intake_virtual_off',
  'intake_inperson_off',
  'office',
  'office_request_only',
  'unbook_slot',
  'booked_note',
  'booked_record'
]);

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
  'unbook_slot',
  'booked_note',
  'booked_record'
]);

const visibleQuickActions = computed(() => {
  const rows = Array.isArray(availableQuickActions.value) ? availableQuickActions.value : [];
  const filtered = rows.filter((row) => row?.visible !== false);
  if (modalActionSource.value === 'office_block') {
    return filtered.filter((row) => row?.id && OFFICE_BLOCK_ONLY_ACTIONS.has(row.id));
  }
  if (viewMode.value === 'office_layout') {
    return filtered.filter((row) => row?.id && OFFICE_LAYOUT_ONLY_ACTIONS.has(row.id));
  }
  return filtered;
});

const actionRequiresAgency = computed(() => !AGENCY_OPTIONAL_ACTIONS.has(String(requestType.value || '')));
const scheduleEventRequiresAgency = computed(() => ['indirect_services', 'agency_meeting'].includes(String(requestType.value || '')));

const intakeActionHelpText = computed(() => {
  const labels = {
    intake_virtual_on: 'Enable virtual intake for this office slot. If virtual working hours are missing, they will be auto-created.',
    intake_virtual_off: 'Disable virtual intake for this office slot (regular virtual availability stays active).',
    intake_inperson_on: 'Enable in-person intake for this assigned office slot.',
    intake_inperson_off: 'Disable in-person intake for this slot.'
  };
  return labels[String(requestType.value || '')] || '';
});

const submitActionLabel = computed(() => {
  const labels = {
    individual_session: 'Book individual session',
    group_session: 'Book group session',
    office: 'Submit office booking',
    office_request_only: 'Submit office request',
    school: 'Submit school request',
    supervision: isGroupSupervisionType.value ? 'Schedule group supervision' : 'Schedule supervision',
    agency_meeting: 'Create agency meeting',
    personal_event: 'Create personal event',
    schedule_hold: 'Create schedule hold',
    schedule_hold_all_day: 'Create all-day hold',
    indirect_services: 'Create indirect service event',
    forfeit_slot: 'Forfeit selected slot(s)',
    extend_assignment: 'Extend assignment',
    intake_virtual_on: 'Enable virtual intake',
    intake_virtual_off: 'Disable virtual intake',
    intake_inperson_on: 'Enable in-person intake',
    intake_inperson_off: 'Disable in-person intake',
    booked_note: 'Open Note Aid',
    booked_record: 'Open recorder',
    unbook_slot: 'Unbook selected slot(s)'
  };
  return labels[String(requestType.value || '')] || 'Submit request';
});

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
    maxUnitsPerDay: Number(row?.maxUnitsPerDay || 0) || null
  })).filter((row) => row.code);
  const selected = normalizeCodeValue(bookingServiceCode.value);
  if (selected && !out.some((row) => row.code === selected)) {
    out.push({ code: selected, label: `Legacy (${selected})`, minDurationMinutes: null, unitMinutes: null, maxUnitsPerDay: null });
  }
  return out;
});
const serviceCodeOptionHints = (opt) => {
  const hints = [];
  if (Number(opt?.minDurationMinutes || 0) > 0) hints.push(`min ${Number(opt.minDurationMinutes)}m`);
  if (Number(opt?.unitMinutes || 0) > 0) hints.push(`${Number(opt.unitMinutes)}m units`);
  if (Number(opt?.maxUnitsPerDay || 0) > 0) hints.push(`max ${Number(opt.maxUnitsPerDay)}/day`);
  return hints.length ? ` (${hints.join(', ')})` : '';
};

const bookingRequiresServiceCode = computed(() => ['SESSION', 'ASSESSMENT'].includes(normalizeCodeValue(bookingAppointmentType.value)));
const isSessionBookingRequestType = computed(() => ['individual_session', 'group_session'].includes(String(requestType.value || '')));
const bookingClassificationInvalidReason = computed(() => {
  if (!showClinicalBookingFields.value) return '';
  if (!isSessionBookingRequestType.value) return '';
  if (!normalizeCodeValue(bookingAppointmentType.value)) return 'Select an appointment type.';
  if (bookingRequiresServiceCode.value && !normalizeCodeValue(bookingServiceCode.value)) {
    return 'A service code is required for this appointment type.';
  }
  return '';
});

const resetBookingSelectionDefaults = () => {
  bookingAppointmentType.value = DEFAULT_BOOKING_TYPE;
  bookingAppointmentSubtype.value = '';
  bookingServiceCode.value = '';
  bookingModality.value = '';
};

const resetBookingMetadataState = () => {
  bookingMetadataLoading.value = false;
  bookingMetadataError.value = '';
  bookingMetadata.value = { appointmentTypes: [], appointmentSubtypes: [], serviceCodes: [] };
};

const normalizeBookingSelectionPayload = () => ({
  appointmentTypeCode: (showClinicalBookingFields.value && isSessionBookingRequestType.value)
    ? (normalizeCodeValue(bookingAppointmentType.value) || null)
    : 'AVAILABLE_SLOT',
  appointmentSubtypeCode: (showClinicalBookingFields.value && isSessionBookingRequestType.value)
    ? (normalizeCodeValue(bookingAppointmentSubtype.value) || null)
    : null,
  serviceCode: (showClinicalBookingFields.value && isSessionBookingRequestType.value)
    ? (normalizeCodeValue(bookingServiceCode.value) || null)
    : null,
  modality: (showClinicalBookingFields.value && isSessionBookingRequestType.value)
    ? (normalizeCodeValue(bookingModality.value) || null)
    : null
});

const loadBookingMetadataForProvider = async () => {
  if (!['office', 'individual_session', 'group_session'].includes(String(requestType.value || '')) || !showRequestModal.value) return;
  if (!showClinicalBookingFields.value) return;
  if (!Number(selectedOfficeLocationId.value || 0)) {
    resetBookingMetadataState();
    return;
  }
  const providerId = Number(props.userId || authStore.user?.id || 0);
  if (!providerId) {
    resetBookingMetadataState();
    return;
  }
  try {
    bookingMetadataLoading.value = true;
    bookingMetadataError.value = '';
    const resp = await api.get('/office-schedule/booking-metadata', { params: { providerId } });
    bookingMetadata.value = {
      appointmentTypes: Array.isArray(resp?.data?.appointmentTypes) ? resp.data.appointmentTypes : [],
      appointmentSubtypes: Array.isArray(resp?.data?.appointmentSubtypes) ? resp.data.appointmentSubtypes : [],
      serviceCodes: Array.isArray(resp?.data?.serviceCodes) ? resp.data.serviceCodes : []
    };
  } catch (e) {
    bookingMetadata.value = { appointmentTypes: [], appointmentSubtypes: [], serviceCodes: [] };
    bookingMetadataError.value = e?.response?.data?.error?.message || 'Could not load booking metadata for this provider.';
  } finally {
    bookingMetadataLoading.value = false;
  }
};

const modalOfficeRoomOptions = computed(() => {
  const g = officeGrid.value;
  const officeId = Number(selectedOfficeLocationId.value || 0);
  if (!officeId || !g || !Array.isArray(g.rooms) || !Array.isArray(g.slots)) return [];

  const dayIdx = ALL_DAYS.indexOf(String(modalDay.value));
  if (dayIdx < 0) return [];
  const date = addDaysYmd(weekStart.value, dayIdx);
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

const officeBookingValid = computed(() => {
  if (!['office', 'individual_session', 'group_session'].includes(String(requestType.value || ''))) return true;
  const officeId = Number(selectedOfficeLocationId.value || 0);
  if (!officeId) return false;
  const endH = Number(modalEndHour.value);
  const startH = Number(modalHour.value);
  if (!(endH > startH)) return false;
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
const supervisionSessionType = ref('individual');
const supervisionIncludeAllAgencies = ref(false);
const selectedSupervisionParticipantId = ref(0);
const selectedSupervisionAdditionalParticipantIds = ref([]);
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
const isGroupSupervisionType = computed(() => String(supervisionSessionType.value || '').toLowerCase() === 'group');
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
  if (isGroupSupervisionType.value && supervisionSelectedParticipantCount.value < 2) return false;
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
  const ranges = mergeSelectedSlotsByDay({ dayName: modalDay.value, startHour: Number(modalHour.value), endHour: Number(modalEndHour.value) })
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
            includeGoogleBusy: showGoogleBusy.value ? 'true' : 'false'
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
  if (!meetingUsingAllAgencies.value && !effectiveAgencyId.value) return;
  try {
    meetingCandidatesLoading.value = true;
    const params = {
      allAgencies: meetingUsingAllAgencies.value ? 'true' : 'false'
    };
    if (!meetingUsingAllAgencies.value) params.agencyId = Number(effectiveAgencyId.value || 0);
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

const endHourOptions = computed(() => {
  const start = Number(modalHour.value || 0);
  // Grid hours are 7..21 (end 22). Allow multi-hour ranges up to end-of-grid.
  const maxEnd = 22;
  const out = [];
  const first = canUseQuarterHourInput.value ? start : (start + 1);
  for (let h = first; h <= maxEnd; h++) out.push(h);
  return out;
});

const ensureModalEndTimeValid = () => {
  const startH = Number(modalHour.value || 0);
  const maxEnd = 22;
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
const canUseSchool = (dayName, startHour, endHour) => {
  const sh = Number(startHour);
  const eh = Number(endHour);
  if (!isWeekdayName(dayName)) return false;
  if (!(eh > sh)) return false;
  // School daytime availability must be between 06:00 and 18:00.
  return sh >= 6 && eh <= 18;
};

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
  return {
    dayName: String(dayName),
    dateYmd: String(dateYmd || addDaysYmd(weekStart.value, ALL_DAYS.indexOf(String(dayName || '')))).slice(0, 10),
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
    roomId: Number(roomId || slot?.roomId || slot?.room_id || top?.roomId || 0) || null,
    standingAssignmentId: Number(slot?.standingAssignmentId || top?.standingAssignmentId || 0) || null,
    assignmentAvailabilityMode: String(slot?.assignmentAvailabilityMode || top?.assignmentAvailabilityMode || '').toUpperCase() || null,
    assignmentTemporaryExtensionCount: Number(slot?.assignmentTemporaryExtensionCount ?? top?.assignmentTemporaryExtensionCount ?? 0),
    slotState: rawState,
    virtualIntakeEnabled: (slot?.virtualIntakeEnabled === true) || (top?.virtualIntakeEnabled === true),
    inPersonIntakeEnabled: (slot?.inPersonIntakeEnabled === true) || (top?.inPersonIntakeEnabled === true)
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

const maybeAutoOpenSelectionActions = () => {
  if (!canBookFromGrid.value || showRequestModal.value) return;
  const rows = sortedSelectedActionSlots();
  if (rows.length <= 1) return;
  const sig = selectedActionSignature(rows);
  if (!sig || sig === lastAutoOpenedSelectionSignature.value) return;
  lastAutoOpenedSelectionSignature.value = sig;
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
  actionSource = 'general'
} = {}) => {
  if (!canBookFromGrid.value) return;
  modalActionSource.value = String(actionSource || 'general');
  modalDay.value = String(dayName);
  modalHour.value = Number(hour);
  // Default to a 1-hour range; clamp to end-of-grid.
  const nextEnd = Math.min(Number(hour) + 1, 22);
  modalEndHour.value = nextEnd > Number(hour) ? nextEnd : Number(hour) + 1;
  const normalizedInitialRequestType = String(initialRequestType || '').trim();
  requestType.value = normalizedInitialRequestType || '';
  requestTypeChosenByUser.value = Boolean(normalizedInitialRequestType);
  requestNotes.value = '';
  scheduleEventTitle.value = '';
  scheduleEventAllDay.value = false;
  scheduleEventPrivate.value = false;
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
  resetBookingMetadataState();
  supervisionParticipantSearch.value = '';
  supervisionSessionType.value = 'individual';
  supervisionIncludeAllAgencies.value = false;
  selectedSupervisionParticipantId.value = 0;
  selectedSupervisionAdditionalParticipantIds.value = [];
  createSupervisionMeetLink.value = true;
  meetingParticipantSearch.value = '';
  selectedMeetingParticipantIds.value = [];
  meetingIncludeAllAgencies.value = false;
  meetingBusyByUserId.value = {};
  createMeetingMeetLink.value = true;
  createAgendaDraftTitle.value = '';
  createAgendaDraftItems.value = [];
  modalContext.value = buildModalContext({ dayName: modalDay.value, hour: modalHour.value, roomId, slot, dateYmd });
  const contextAgencyId = Number(modalContext.value?.agencyId || 0);
  if (contextAgencyId && effectiveAgencyIds.value.includes(contextAgencyId)) {
    selectedActionAgencyId.value = contextAgencyId;
  } else if (!selectedActionAgencyId.value || !effectiveAgencyIds.value.includes(Number(selectedActionAgencyId.value))) {
    selectedActionAgencyId.value = Number(effectiveAgencyIds.value[0] || 0) || 0;
  }
  if (!normalizedInitialRequestType && String(modalContext.value.slotState || '').toUpperCase() === 'ASSIGNED_BOOKED') {
    requestType.value = 'booked_note';
  }
  if (!normalizedInitialRequestType && viewMode.value === 'office_layout' && ['', 'OPEN', 'ASSIGNED_AVAILABLE', 'ASSIGNED_TEMPORARY'].includes(String(modalContext.value.slotState || '').toUpperCase())) {
    requestType.value = 'office_request_only';
  }
  // If user selected a contiguous range on one day, use it as the default modal duration.
  const rows = preserveSelectionRange ? sortedSelectedActionSlots() : [];
  if (preserveSelectionRange && rows.length > 1) {
    const sameDay = rows.every((x) => String(x.dateYmd || '') === String(rows[0]?.dateYmd || ''));
    if (sameDay) {
      const minHour = Math.min(...rows.map((x) => Number(x.hour || 0)));
      const maxHour = Math.max(...rows.map((x) => Number(x.hour || 0)));
      if (Number.isFinite(minHour) && Number.isFinite(maxHour)) {
        modalHour.value = minHour;
        modalEndHour.value = Math.min(maxHour + 1, 22);
      }
    }
  }
  const fallbackDate = String(dateYmd || addDaysYmd(weekStart.value, ALL_DAYS.indexOf(String(dayName || '')))).slice(0, 10);
  const fallbackRow = {
    key: actionSlotKey({ dateYmd: fallbackDate, hour, roomId }),
    dateYmd: fallbackDate,
    dayName: String(dayName || ''),
    hour: Number(hour || 0),
    roomId: Number(roomId || 0)
  };
  lastAutoOpenedSelectionSignature.value = selectedActionSignature(rows.length ? rows : [fallbackRow]);
  showRequestModal.value = true;
  void loadBookingMetadataForProvider();
  void loadSupervisionProviders();
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
      next.set(key, {
        key,
        dateYmd: ymd,
        dayName: dayNameForDateYmd(ymd) || current.dayName,
        hour: h,
        roomId: Number(current.roomId || 0),
        slot: null
      });
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
  const dateYmd = String(options?.dateYmd || addDaysYmd(weekStart.value, ALL_DAYS.indexOf(String(dayName || '')))).slice(0, 10);
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
      const initialRequestType =
        clickedSlotState === 'ASSIGNED_BOOKED'
          ? 'booked_note'
          : ['ASSIGNED_AVAILABLE', 'ASSIGNED_TEMPORARY'].includes(clickedSlotState)
            ? 'forfeit_slot'
            : 'office_request_only';
      openSlotActionModal({
        dayName,
        hour,
        roomId,
        dateYmd,
        slot,
        preserveSelectionRange: false,
        initialRequestType,
        actionSource: 'office_block'
      });
      return;
    }
    const officeTop = officeId ? officeTopEvent(dayName, hour, officeId, roomId) : null;
    if (officeTop) {
      // User has assignment in this room – show forfeit/extend modal
      const slotState = String(officeTop?.slotState || '').toUpperCase();
      const initialRequestType =
        slotState === 'ASSIGNED_BOOKED' ? 'booked_note' : ['ASSIGNED_AVAILABLE', 'ASSIGNED_TEMPORARY'].includes(slotState) ? 'forfeit_slot' : 'office_request_only';
      openSlotActionModal({
        dayName,
        hour,
        roomId: Number(officeTop?.roomId || 0) || 0,
        dateYmd,
        slot: officeTop,
        preserveSelectionRange: false,
        initialRequestType,
        actionSource: 'office_block'
      });
    } else {
      // Open or someone else's – show request modal
      openSlotActionModal({ ...item, preserveSelectionRange: false, actionSource: 'plus_or_blank' });
    }
  } else if (isCellVisuallyBlank(dayName, hour)) {
    openSlotActionModal({ ...item, preserveSelectionRange: false, actionSource: 'plus_or_blank' });
  } else if (canBookFromGrid.value) {
    // Cell has content (e.g. user's assigned office slot) – single-click opens modal for forfeit/extend
    const blocks = cellBlocks(dayName, hour);
    const officeBlock = blocks.find((b) => ['oa', 'ot', 'ob', 'intake-ip', 'intake-vi'].includes(String(b?.kind || '')));
    if (officeBlock) {
      const officeId = Number(officeBlock?.buildingId || selectedOfficeLocationId.value || 0) || null;
      const blockRoomId = Number(officeBlock?.roomId || 0) || null;
      const officeTop = officeTopEvent(dayName, hour, officeId, blockRoomId) || null;
      const slotState = String(officeTop?.slotState || '').toUpperCase();
      const initialRequestType =
        slotState === 'ASSIGNED_BOOKED' ? 'booked_note' : ['ASSIGNED_AVAILABLE', 'ASSIGNED_TEMPORARY'].includes(slotState) ? 'forfeit_slot' : 'office_request_only';
      openSlotActionModal({
        dayName,
        hour,
        roomId: Number(officeTop?.roomId || 0) || 0,
        dateYmd,
        slot: officeTop,
        preserveSelectionRange: false,
        initialRequestType,
        actionSource: 'office_block'
      });
    }
  }
};

const onCellDoubleClick = (dayName, hour, event = null, options = {}) => {
  if (!canBookFromGrid.value) return;
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const dateYmd = String(options?.dateYmd || addDaysYmd(weekStart.value, ALL_DAYS.indexOf(String(dayName || '')))).slice(0, 10);
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
  const dateYmd = addDaysYmd(weekStart.value, ALL_DAYS.indexOf(String(dayName || '')));
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
  const dateYmd = addDaysYmd(weekStart.value, ALL_DAYS.indexOf(String(dayName || '')));
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

// ---- Provider office overlay (selected office location weekly grid) ----
const selectedOfficeLocationId = ref(0);
const officeGridLoading = ref(false);
const officeGridError = ref('');
const officeGrid = ref(null); // { location, weekStart, days, hours, rooms, slots }

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
        : st === 'assigned_available' ? 'Assigned available'
          : st === 'assigned_temporary' ? 'Assigned temporary'
            : 'Open';
    if (pending > 0) statusLabel = `Requested${statusLabel !== 'Open' ? ` (${statusLabel})` : ''}`;
    const providerLabel = String(slot?.bookedProviderName || slot?.assignedProviderName || slot?.providerInitials || '').trim() || '—';
    const roomLabel = `${r?.roomNumber ? `#${r.roomNumber} ` : ''}${r?.label || r?.name || `Room ${r?.id || ''}`}`.trim();
    const bookedByMe = st === 'assigned_booked' && currentUserId > 0 && Number(slot?.bookedProviderId || 0) === currentUserId;
    const isClickable = st !== 'assigned_booked' || bookedByMe;
    return {
      roomId: Number(r.id),
      roomLabel,
      state: st,
      statusLabel,
      providerLabel,
      hasPendingRequest: pending > 0,
      slot,
      isClickable
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
  if (!row?.isClickable) return;
  const dateYmd = String(quickGlanceDateYmd.value || '').slice(0, 10);
  const hour = Number(quickGlanceHour.value || 0);
  const dayName = dayNameForDateYmd(dateYmd);
  if (!dateYmd || !Number.isFinite(hour) || !dayName) return;
  const st = String(row?.state || 'open').toUpperCase();
  const initialRequestType =
    st === 'ASSIGNED_BOOKED' ? 'booked_note'
      : ['OPEN', 'ASSIGNED_AVAILABLE', 'ASSIGNED_TEMPORARY'].includes(st) ? 'office_request_only'
        : '';
  openSlotActionModal({
    dayName,
    hour,
    roomId: Number(row?.roomId || 0),
    slot: row?.slot || null,
    dateYmd,
    preserveSelectionRange: false,
    initialRequestType,
    actionSource: 'quick_glance'
  });
};

const loadSelectedOfficeGrid = async () => {
  const id = Number(selectedOfficeLocationId.value || 0);
  if (!id) {
    officeGrid.value = null;
    officeGridError.value = '';
    return;
  }
  try {
    officeGridLoading.value = true;
    officeGridError.value = '';
    const r = await api.get(`/office-schedule/locations/${id}/weekly-grid`, {
      params: { weekStart: weekStart.value },
      skipGlobalLoading: true
    });
    officeGrid.value = r.data || null;
  } catch (e) {
    officeGrid.value = null;
    officeGridError.value = e.response?.data?.error?.message || 'Failed to load office availability';
  } finally {
    officeGridLoading.value = false;
  }
};

watch([selectedOfficeLocationId, weekStart, viewMode], () => {
  if (viewMode.value !== 'office_layout') {
    officeGrid.value = null;
    officeGridError.value = '';
    officeGridLoading.value = false;
    return;
  }
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
  const id = Number(selectedOfficeLocationId.value || 0);
  if (!id) return '';
  const dayIdx = ALL_DAYS.indexOf(String(dayName));
  if (dayIdx < 0) return '';
  const date = addDaysYmd(weekStart.value, dayIdx);
  const rec = officeOverlayStats.value.get(officeOverlayKey(date, hour));
  if (!rec) return '';
  if (rec.open > 0) return `Open ${rec.open}`;
  if (rec.assigned_available > 0) return `Avail ${rec.assigned_available}`;
  if (rec.assigned_temporary > 0) return `Temp ${rec.assigned_temporary}`;
  if (rec.assigned_booked > 0) return 'Booked';
  return '';
};

const officeOverlayTitle = (dayName, hour) => {
  const dayIdx = ALL_DAYS.indexOf(String(dayName));
  if (dayIdx < 0) return '';
  const date = addDaysYmd(weekStart.value, dayIdx);
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

const cellBlockStyle = (b) => {
  const kind = String(b?.kind || '');
  const style = {};
  const officeKindFillMap = {
    oa: { fill: 'rgba(59, 130, 246, 0.24)', border: 'rgba(37, 99, 235, 0.60)' }, // assigned
    ot: { fill: 'rgba(249, 115, 22, 0.24)', border: 'rgba(194, 65, 12, 0.62)' }, // temporary
    ob: { fill: 'rgba(239, 68, 68, 0.24)', border: 'rgba(185, 28, 28, 0.62)' } // booked
  };
  if (officeKindFillMap[kind]) {
    style['--blockFill'] = officeKindFillMap[kind].fill;
    style['--blockBorder'] = officeKindFillMap[kind].border;
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

const officeAssignEndHourOptions = computed(() => {
  const start = Number(officeAssignStartHour.value || 0);
  const maxEnd = 22;
  const out = [];
  for (let h = start + 1; h <= maxEnd; h++) out.push(h);
  return out;
});

const loadOfficeLocations = async () => {
  try {
    const r = await api.get('/offices');
    const rows = Array.isArray(r.data) ? r.data : [];
    officeLocations.value = rows;

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
    const dayIdx = ALL_DAYS.indexOf(String(officeAssignDay.value));
    if (dayIdx < 0) throw new Error('Invalid day');
    const dateYmd = addDaysYmd(weekStart.value, dayIdx);
    await api.post(`/office-slots/${officeAssignBuildingId.value}/open-slots/assign`, {
      roomId: officeAssignRoomId.value,
      assignedUserId: Number(props.userId),
      date: dateYmd,
      hour: officeAssignStartHour.value,
      endHour: officeAssignEndHour.value
    });
    closeOfficeAssignModal();
    await load();
  } catch (e) {
    officeAssignError.value = e.response?.data?.error?.message || e.message || 'Failed to assign slot';
  } finally {
    officeAssignLoading.value = false;
  }
};

const closeModal = () => {
  showRequestModal.value = false;
  modalActionSource.value = 'general';
  requestType.value = '';
  requestTypeChosenByUser.value = false;
  requestNotes.value = '';
  scheduleEventTitle.value = '';
  scheduleEventAllDay.value = false;
  scheduleEventPrivate.value = false;
  modalStartMinute.value = 0;
  modalEndMinute.value = 0;
  scheduleHoldReasonCode.value = 'DOCUMENTATION';
  scheduleHoldCustomReason.value = '';
  modalError.value = '';
  intakeConfirmStep.value = null;
  intakeConfirmChoice.value = null;
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
  const rows = sortedSelectedActionSlots();
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
  if (actionId === 'indirect_services') return 'INDIRECT_SERVICES';
  if (actionId === 'schedule_hold' || actionId === 'schedule_hold_all_day') return 'SCHEDULE_HOLD';
  return 'PERSONAL_EVENT';
};

const mergeSelectedSlotsByDay = ({ dayName, startHour, endHour }) => {
  const selected = sortedSelectedActionSlots();
  const fallbackDate = addDaysYmd(weekStart.value, ALL_DAYS.indexOf(String(dayName)));
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

const submitRequest = async () => {
  if (actionRequiresAgency.value && !effectiveAgencyId.value) return;

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

    const dn = modalDay.value;
    const h = Number(modalHour.value);
    const endH = Number(modalEndHour.value);
    const startMinute = canUseQuarterHourInput.value ? Number(modalStartMinute.value || 0) : 0;
    const endMinute = canUseQuarterHourInput.value ? Number(modalEndMinute.value || 0) : 0;
    const startTotalMinutes = (h * 60) + startMinute;
    const endTotalMinutes = (endH * 60) + endMinute;
    if (!(isScheduleEventRequestType.value && scheduleEventAllDay.value) && !(endTotalMinutes > startTotalMinutes)) {
      throw new Error('End time must be after start time.');
    }

    if (requestType.value === 'booked_note') {
      openNoteAidFromContext('note');
      return;
    } else if (requestType.value === 'booked_record') {
      openNoteAidFromContext('record_session');
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
    } else if (isScheduleEventRequestType.value) {
      const uid = Number(props.userId || authStore.user?.id || 0);
      if (!uid) throw new Error('Provider is required.');
      const normalizedAction = String(requestType.value || '');
      const eventKind = scheduleEventKindForAction(normalizedAction);
      const meetingAttendeeUserIds = normalizedAction === 'agency_meeting'
        ? Array.from(selectedMeetingParticipantIdSet.value.values()).map((n) => Number(n || 0)).filter((n) => n > 0)
        : [];
      if (normalizedAction === 'agency_meeting' && !meetingAttendeeUserIds.length) {
        throw new Error('Select at least one meeting participant.');
      }
      const eventAgencyId = scheduleEventRequiresAgency.value
        ? (Number(effectiveAgencyId.value || 0) || null)
        : null;
      if (scheduleEventRequiresAgency.value && !eventAgencyId) {
        throw new Error('Select an agency for this event type.');
      }
      const title = String(scheduleEventTitle.value || '').trim() || defaultScheduleEventTitleForAction(normalizedAction);
      const reasonCode = eventKind === 'SCHEDULE_HOLD' ? effectiveScheduleHoldReason() : null;
      const isPrivate = !!scheduleEventPrivate.value;
      if (scheduleEventAllDay.value || normalizedAction === 'schedule_hold_all_day') {
        const ranges = mergeSelectedSlotsByDay({ dayName: dn, startHour: h, endHour: endH });
        const dates = Array.from(new Set(ranges.map((x) => String(x.dateYmd || '').slice(0, 10)).filter(Boolean)));
        for (const dateYmd of dates) {
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
            ...(normalizedAction === 'agency_meeting'
              ? {
                  attendeeUserIds: meetingAttendeeUserIds,
                  createMeetLink: !!createMeetingMeetLink.value
                }
              : {})
          });
          const created = resp?.data?.event || null;
          if (created) createdScheduleEvents.push(created);
        }
      } else {
        const ranges = mergeSelectedSlotsByDay({ dayName: dn, startHour: h, endHour: endH });
        for (const row of ranges) {
          const startAt = `${String(row.dateYmd).slice(0, 10)}T${pad2(Number(row.startHour))}:${pad2(startMinute)}:00`;
          const endAt = `${String(row.dateYmd).slice(0, 10)}T${pad2(Number(row.endHour))}:${pad2(endMinute)}:00`;
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
            ...(normalizedAction === 'agency_meeting'
              ? {
                  attendeeUserIds: meetingAttendeeUserIds,
                  createMeetLink: !!createMeetingMeetLink.value
                }
              : {})
          });
          const created = resp?.data?.event || null;
          if (created) createdScheduleEvents.push(created);
        }
      }
      if (createdScheduleEvents.length) {
        refreshInBackground = true;
        if (requestType.value === 'agency_meeting' && createAgendaDraftItems.value.length) {
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
      const recurrence = String(officeBookingRecurrence.value || 'ONCE');
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
      } else {
        for (const ctx of contexts) {
          const standingAssignmentId = Number(ctx?.standingAssignmentId || 0);
          const officeEventId = Number(ctx?.officeEventId || 0);
          if (standingAssignmentId > 0) {
            // eslint-disable-next-line no-await-in-loop
            await api.post(`/office-slots/${ctx.officeLocationId}/assignments/${standingAssignmentId}/booking-plan`, {
              bookedFrequency: recurrence,
              bookedOccurrenceCount: Number(occurrenceCount || 6),
              bookingStartDate: String(ctx?.dateYmd || '').slice(0, 10) || addDaysYmd(weekStart.value, ALL_DAYS.indexOf(String(dn))),
              recurringUntilDate: addDaysYmd(String(ctx?.dateYmd || '').slice(0, 10) || addDaysYmd(weekStart.value, ALL_DAYS.indexOf(String(dn))), 364),
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
              bookingStartDate: String(ctx?.dateYmd || '').slice(0, 10) || addDaysYmd(weekStart.value, ALL_DAYS.indexOf(String(dn))),
              recurringUntilDate: addDaysYmd(String(ctx?.dateYmd || '').slice(0, 10) || addDaysYmd(weekStart.value, ALL_DAYS.indexOf(String(dn))), 364),
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
      }
    } else if (requestType.value === 'individual_session' || requestType.value === 'group_session') {
      const officeId = Number(selectedOfficeLocationId.value || 0);
      if (!officeId) throw new Error('Select an office first.');
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
        dateYmd: addDaysYmd(weekStart.value, ALL_DAYS.indexOf(String(dn))),
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
          ...(isAdminMode.value ? { requestedProviderId: Number(props.userId) } : {})
        });
        if (r?.data?.kind === 'auto_booked') {
          // eslint-disable-next-line no-await-in-loop
          await loadSelectedOfficeGrid();
        }
      }
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
      const baseDateYmd = addDaysYmd(weekStart.value, ALL_DAYS.indexOf(String(dn)));
      const targets = Array.from({ length: Math.max(1, endH - h) }, (_, i) => ({
        dateYmd: baseDateYmd,
        dayName: dn,
        hour: h + i,
        roomId: baseRoomId
      }));
      const roomIds = [...new Set(targets.map((t) => Number(t.roomId || 0)).filter((n) => n > 0))];
      const singleRoomId = roomIds.length === 1 ? roomIds[0] : 0;
      const dayToHours = new Map();
      for (const t of targets) {
        const day = String(t.dayName || dayNameForDateYmd(t.dateYmd) || dn);
        if (!dayToHours.has(day)) dayToHours.set(day, []);
        dayToHours.get(day).push(Number(t.hour || h));
      }
      const slots = [];
      for (const [day, hoursList] of dayToHours.entries()) {
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
            weekday: ((ALL_DAYS.indexOf(day) + 1) % 7),
            startHour: start,
            endHour: prev + 1,
            roomId: singleRoomId || undefined
          });
          start = val;
          prev = val;
        }
        if (start !== null) {
          slots.push({
            weekday: ((ALL_DAYS.indexOf(day) + 1) % 7),
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
      await loadSelectedOfficeGrid();
    } else if (requestType.value === 'school') {
      if (isAdminMode.value) throw new Error('School availability requests must be created from the provider schedule.');
      if (!canUseSchool(dn, h, endH)) throw new Error('School daytime availability must be on weekdays and between 06:00 and 18:00.');
      const targets = sortedSelectedActionSlots().length ? sortedSelectedActionSlots() : [{
        dateYmd: addDaysYmd(weekStart.value, ALL_DAYS.indexOf(String(dn))),
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
      const sessionType = isGroupSupervisionType.value ? 'group' : 'individual';
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
      if (sessionType === 'group' && additionalAttendeeUserIds.length < 1) {
        throw new Error('Group supervision requires selecting at least one additional participant.');
      }
      const dayIdx = ALL_DAYS.indexOf(String(dn));
      if (dayIdx < 0) throw new Error('Invalid day');
      const dateYmd = addDaysYmd(weekStart.value, dayIdx);
      const startAt = `${dateYmd}T${pad2(h)}:${pad2(startMinute)}:00`;
      const endAt = `${dateYmd}T${pad2(endH)}:${pad2(endMinute)}:00`;
      const supvRes = await api.post('/supervision/sessions', {
        agencyId: effectiveAgencyId.value,
        supervisorUserId: actorId,
        superviseeUserId: participantId,
        sessionType,
        additionalAttendeeUserIds,
        startAt,
        endAt,
        notes: requestNotes.value || '',
        createMeetLink: !!createSupervisionMeetLink.value,
        modality: 'virtual'
      });
      const sessionId = supvRes?.data?.session?.id;
      if (sessionId && createAgendaDraftItems.value.length) {
        postAgendaItemsForNewMeeting('supervision_session', sessionId).catch(() => {});
      }
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
    if (refreshInBackground) {
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
          htmlLink: ev?.htmlLink || null,
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
  if (!['supervision', 'agency_meeting', 'personal_event', 'schedule_hold', 'indirect_services'].includes(String(t || ''))) {
    modalStartMinute.value = 0;
    modalEndMinute.value = 0;
  }
  if (t === 'supervision') {
    void loadSupervisionProviders();
  } else if (t === 'agency_meeting') {
    void loadMeetingCandidates();
  } else if ((t === 'office' || t === 'individual_session' || t === 'group_session') && showClinicalBookingFields.value) {
    void loadBookingMetadataForProvider();
  } else if (SCHEDULE_EVENT_ACTIONS.has(String(t || ''))) {
    if (!String(scheduleEventTitle.value || '').trim() || scheduleEventTitle.value === defaultScheduleEventTitleForAction('personal_event')) {
      scheduleEventTitle.value = defaultScheduleEventTitleForAction(String(t || ''));
    }
    if (t === 'schedule_hold_all_day') scheduleEventAllDay.value = true;
    if (t === 'schedule_hold') scheduleEventAllDay.value = false;
    if (t === 'personal_event' || t === 'indirect_services' || t === 'agency_meeting') {
      scheduleEventAllDay.value = false;
    }
  }
  ensureModalEndTimeValid();
});

watch(supervisionSessionType, (nextType) => {
  if (String(nextType || '') !== 'group' && supervisionIncludeAllAgencies.value) {
    supervisionIncludeAllAgencies.value = false;
    return;
  }
  if (String(requestType.value || '') === 'supervision' && showRequestModal.value) {
    selectedSupervisionParticipantId.value = 0;
    selectedSupervisionAdditionalParticipantIds.value = [];
    supervisionParticipantSearch.value = '';
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
  if (String(requestType.value || '') !== 'agency_meeting' || !showRequestModal.value) return;
  selectedMeetingParticipantIds.value = [];
  meetingParticipantSearch.value = '';
  void loadMeetingCandidates();
});

watch([showRequestModal, requestType, effectiveAgencyId], ([isOpen, type, agencyId], [prevOpen, prevType, prevAgencyId]) => {
  if (!isOpen) return;
  if (String(type || '') !== 'agency_meeting') return;
  if (meetingUsingAllAgencies.value) return;
  const currentAgencyId = Number(agencyId || 0);
  const previousAgencyId = Number(prevAgencyId || 0);
  const agencyChanged = currentAgencyId > 0 && currentAgencyId !== previousAgencyId;
  const stayedOnMeeting = String(prevType || '') === 'agency_meeting' && isOpen === !!prevOpen;
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
  if (String(type || '') !== 'agency_meeting' || !showRequestModal.value) return;
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
  if (!rows.length) {
    requestType.value = '';
    requestTypeChosenByUser.value = false;
    return;
  }
  const ids = new Set(rows.map((row) => String(row?.id || '')).filter(Boolean));
  if (!ids.has(String(requestType.value || ''))) {
    if (rows.length === 1) {
      requestType.value = String(rows[0]?.id || '');
      requestTypeChosenByUser.value = false;
    } else if (requestTypeChosenByUser.value) {
      requestType.value = String(rows[0]?.id || '');
    } else {
      requestType.value = '';
    }
  }
}, { deep: true });

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

const startTrackedSupvMeetForSession = async (session) => {
  const link = String(session?.googleMeetLink || '').trim();
  const sid = Number(session?.id || 0);
  if (!link || !sid) return;
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
const toDatetimeLocalValue = (d) => {
  if (!d) return '';
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
    if (!meet) continue;
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

const saveSupvSession = async () => {
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
      notes: supvNotes.value || '',
      createMeetLink: !!supvCreateMeetLink.value
    });
    await load();
    closeSupvModal();
  } catch (e) {
    supvModalError.value = e.response?.data?.error?.message || e.message || 'Failed to save session';
  } finally {
    supvSaving.value = false;
  }
};

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
    await load();
    closeSupvModal();
  } catch (e) {
    supvModalError.value = e.response?.data?.error?.message || e.message || 'Failed to cancel session';
  } finally {
    supvSaving.value = false;
  }
};

const onCellBlockClick = (e, block, dayName, hour) => {
  const kind = String(block?.kind || '');
  e?.preventDefault?.();
  e?.stopPropagation?.();
  if (kind === 'ebusy') {
    const stackDetails = buildStackDetailsForBlock(block, dayName, hour);
    if (stackDetails) openStackDetailsModal(stackDetails);
    return;
  }
  const dateYmd = addDaysYmd(weekStart.value, ALL_DAYS.indexOf(String(dayName || '')));
  const officeId = ['oa', 'ot', 'ob', 'intake-ip', 'intake-vi'].includes(String(block?.kind || ''))
    ? Number(block?.buildingId || selectedOfficeLocationId.value || 0) || null
    : null;
  const roomIdFilter = ['oa', 'ot', 'ob', 'intake-ip', 'intake-vi'].includes(String(block?.kind || ''))
    ? Number(block?.roomId || 0) || null
    : null;
  const officeTop = officeTopEvent(dayName, hour, officeId, roomIdFilter) || null;
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
  const stackDetails = buildStackDetailsForBlock(block, dayName, hour);
  if (stackDetails) {
    openStackDetailsModal(stackDetails);
    return;
  }
  if (kind === 'sevt') {
    const link = String(block?.link || '').trim();
    if (link) window.open(link, '_blank', 'noreferrer');
    return;
  }
  if (kind === 'gevt') {
    const blockText = `${String(block?.shortLabel || '')} ${String(block?.title || '')}`.toLowerCase();
    const looksLikeSupervision =
      blockText.includes('supervision') ||
      blockText.includes('practice support') ||
      blockText.includes('google meet') ||
      blockText.includes('meet');
    const hasMeetSessionInCell = supervisionSessionsInCell(dayName, hour)
      .some((s) => String(s?.googleMeetLink || '').trim());
    const shouldRouteToSupv = looksLikeSupervision || hasMeetSessionInCell;
    if (shouldRouteToSupv) {
      clearGevtClickTimer();
      gevtClickTimer.value = window.setTimeout(() => {
        openSupvModal(dayName, hour);
        gevtClickTimer.value = null;
      }, 240);
      return;
    }
    const events = googleEventsInCell(dayName, hour);
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
    openSupvModal(dayName, hour);
    return;
  }
  if (['oa', 'ot', 'ob', 'intake-ip', 'intake-vi'].includes(kind)) {
    const officeLocationId = Number(officeTop?.buildingId || 0);
    if (officeLocationId > 0 && Number(selectedOfficeLocationId.value || 0) !== officeLocationId) {
      selectedOfficeLocationId.value = officeLocationId;
    }
    const slotState = String(officeTop?.slotState || '').toUpperCase();
    // Assigned (available/temporary): default to forfeit so user can release slot; booked -> note
    const initialRequestType =
      slotState === 'ASSIGNED_BOOKED' ? 'booked_note' : ['ASSIGNED_AVAILABLE', 'ASSIGNED_TEMPORARY'].includes(slotState) ? 'forfeit_slot' : 'office_request_only';
    openSlotActionModal({
      dayName,
      hour,
      roomId: Number(officeTop?.roomId || 0) || 0,
      dateYmd: addDaysYmd(weekStart.value, ALL_DAYS.indexOf(String(dayName || ''))),
      slot: officeTop,
      preserveSelectionRange: false,
      initialRequestType,
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
const closeStackDetailsModal = () => {
  showStackDetailsModal.value = false;
  stackDetailsTitle.value = '';
  stackDetailsItems.value = [];
};
const openStackDetailsModal = ({ title = '', items = [] } = {}) => {
  stackDetailsTitle.value = String(title || '').trim() || 'Overlapping items';
  stackDetailsItems.value = Array.isArray(items) ? items : [];
  showStackDetailsModal.value = true;
};

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

const buildStackDetailsForBlock = (block, dayName, hour) => {
  const kind = String(block?.kind || '');
  if (kind === 'supv') {
    const sessions = supervisionSessionsInCell(dayName, hour);
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
    const events = scheduleEventsInCell(dayName, hour);
    const titleText = String(block?.title || '').toLowerCase();
    const isScheduleOverflow = kind === 'sevt' || titleText.includes('schedule event');
    if (!isScheduleOverflow || events.length <= 1) return null;
    return {
      title: `Schedule events — ${dayName} ${hourLabel(hour)}`,
      items: events.map((ev, idx) => ({
        id: `sevt-${String(ev?.id || ev?.googleEventId || idx)}`,
        label: String(ev?.title || '').trim() || 'Schedule event',
        subLabel: ev?.allDay ? 'All day' : formatRangeFromRaw(ev?.startAt, ev?.endAt),
        link: String(ev?.htmlLink || '').trim() || ''
      }))
    };
  }
  if (kind === 'gevt' || kind === 'more') {
    const events = googleEventsInCell(dayName, hour);
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
    const labels = externalBusyLabels(dayName, hour);
    if (!labels.length) return null;
    return {
      title: `Therapy Notes busy sources — ${dayName} ${hourLabel(hour)}`,
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
  const link = String(item?.link || '').trim();
  if (link) {
    window.open(link, '_blank', 'noreferrer');
    return;
  }
  const sessionId = Number(item?.sessionId || 0);
  if (sessionId > 0) {
    closeStackDetailsModal();
    openSupvModal(String(item?.dayName || ''), Number(item?.hour || 0));
    selectedSupvSessionId.value = sessionId;
  }
};

const onCellBlockDoubleClick = (e, block, dayName, hour) => {
  e?.preventDefault?.();
  e?.stopPropagation?.();
  const kind = String(block?.kind || '');
  if (kind !== 'gevt') return;
  const hasMeetSessionInCell = supervisionSessionsInCell(dayName, hour)
    .some((s) => String(s?.googleMeetLink || '').trim());
  if (!hasMeetSessionInCell) return;
  const link = String(block?.link || '').trim();
  if (!link) return;
  clearGevtClickTimer();
  window.open(link, '_blank', 'noreferrer');
};

watch([modalHour, modalEndHour, modalStartMinute, modalEndMinute, canUseQuarterHourInput, disableEndTimeInput], () => {
  if (disableEndTimeInput.value) {
    modalStartMinute.value = 0;
    modalEndMinute.value = 0;
    return;
  }
  ensureModalEndTimeValid();
}, { immediate: true });
</script>

<style scoped>
.sched-toolbar { margin-top: 10px; }
.sched-toolbar-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.sched-week-title {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.01em;
  line-height: 1.2;
}
.sched-week-meta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}
.sched-today-label {
  font-size: 12px;
  font-weight: 900;
  color: var(--text-secondary);
  white-space: nowrap;
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
  font-size: 13px;
  padding: 6px 10px;
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
.sched-view-switch {
  display: inline-flex;
  align-items: center;
  background: rgba(15, 23, 42, 0.04);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px;
  gap: 2px;
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
  margin-top: 12px;
  overflow-x: auto;
}
.legend {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 10px;
  color: var(--text-secondary);
  font-size: 13px;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}
.sched-head-cell {
  padding: 8px 10px;
  font-weight: 900;
  background: var(--bg-alt);
  border-bottom: 1px solid var(--border);
  border-left: 1px solid var(--border);
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sched-head-cell-day {
  cursor: pointer;
}
.sched-head-cell-day:hover {
  background: color-mix(in srgb, var(--bg-alt) 84%, rgba(59, 130, 246, 0.10));
}
.sched-head-focused {
  box-shadow: inset 0 0 0 2px rgba(37, 99, 235, 0.45);
}
.sched-head-today {
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.16), rgba(59, 130, 246, 0.06));
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.24), 0 0 0 2px rgba(59, 130, 246, 0.14);
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
  font-weight: 900;
}
.sched-head-date {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}
.sched-hour {
  padding: 8px 10px;
  font-weight: 800;
  border-top: 1px solid var(--border);
  background: var(--bg-alt);
}
.sched-hour-quarter {
  font-weight: 650;
  font-size: 11px;
  color: var(--text-secondary);
  border-top: 1px solid rgba(15, 23, 42, 0.12);
  padding-top: 5px;
  padding-bottom: 5px;
}
.sched-cell {
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  border-left: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.65);
  min-height: var(--sched-cell-min-height, 32px);
  padding: 4px 6px;
  text-align: left;
  position: relative;
  overflow: hidden;
}
.sched-cell-quarter {
  border-top: 1px solid rgba(15, 23, 42, 0.12);
  min-height: max(18px, calc(var(--sched-cell-min-height, 32px) * 0.7));
  padding-top: 2px;
  padding-bottom: 2px;
}
.sched-wrap-quarter .sched-cell-quarter {
  border-top-color: rgba(15, 23, 42, 0.08);
  padding-top: 0;
  padding-bottom: 0;
}
.sched-cell-today {
  background: rgba(59, 130, 246, 0.05);
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.18);
}
.sched-cell.clickable {
  cursor: pointer;
}
.sched-cell.clickable:hover {
  background: rgba(2, 132, 199, 0.06);
}
.sched-cell-selected {
  box-shadow: inset 0 0 0 2px rgba(37, 99, 235, 0.9);
}
.cell-plus-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.25);
  background: rgba(255, 255, 255, 0.86);
  color: rgba(15, 23, 42, 0.85);
  font-weight: 800;
  font-size: 14px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  opacity: 0.5;
  transform: translateY(-1px);
  transition: opacity 120ms ease, transform 120ms ease, background 120ms ease;
  z-index: 3;
}
.sched-cell:hover .cell-plus-btn,
.sched-cell-selected .cell-plus-btn {
  opacity: 1;
}
.cell-plus-btn:hover {
  background: rgba(219, 234, 254, 0.95);
  transform: translateY(-2px);
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
  border: 1px solid rgba(0,0,0,0.12);
  padding: 2px 6px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: rgba(15, 23, 42, 0.92);
  backdrop-filter: blur(1px);
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
.cell-block-text {
  max-width: calc(100% - 14px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-block-request { background: var(--blockFill, var(--sched-request-bg, rgba(242, 201, 76, 0.35))); border-color: var(--blockBorder, var(--sched-request-border, rgba(242, 201, 76, 0.65))); }
.cell-block-school { background: var(--blockFill, var(--sched-school-bg, rgba(45, 156, 219, 0.28))); border-color: var(--blockBorder, var(--sched-school-border, rgba(45, 156, 219, 0.60))); }
.cell-block-supv { background: var(--blockFill, var(--sched-supv-bg, rgba(147, 51, 234, 0.24))); border-color: var(--blockBorder, var(--sched-supv-border, rgba(126, 34, 206, 0.60))); }
.cell-block-oa { background: var(--blockFill, var(--sched-oa-bg, rgba(59, 130, 246, 0.24))); border-color: var(--blockBorder, var(--sched-oa-border, rgba(37, 99, 235, 0.60))); }
.cell-block-ot { background: var(--blockFill, var(--sched-ot-bg, rgba(249, 115, 22, 0.24))); border-color: var(--blockBorder, var(--sched-ot-border, rgba(194, 65, 12, 0.62))); }
.cell-block-ob { background: var(--blockFill, var(--sched-ob-bg, rgba(239, 68, 68, 0.24))); border-color: var(--blockBorder, var(--sched-ob-border, rgba(185, 28, 28, 0.62))); }

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
.cell-block-gbusy { background: var(--sched-gbusy-bg, rgba(17, 24, 39, 0.14)); border-color: var(--sched-gbusy-border, rgba(17, 24, 39, 0.42)); color: rgba(17, 24, 39, 0.9); }
.cell-block-gevt { background: rgba(59, 130, 246, 0.14); border-color: rgba(59, 130, 246, 0.35); cursor: pointer; }
.cell-block-sevt { background: var(--blockFill, rgba(20, 184, 166, 0.20)); border-color: var(--blockBorder, rgba(13, 148, 136, 0.50)); color: rgba(15, 118, 110, 0.96); cursor: pointer; }
.cell-block-ebusy { background: var(--sched-ebusy-bg, rgba(107, 114, 128, 0.16)); border-color: var(--sched-ebusy-border, rgba(107, 114, 128, 0.45)); color: rgba(17, 24, 39, 0.9); }
.cell-block-intake-ip { background: rgba(34, 197, 94, 0.20); border-color: rgba(21, 128, 61, 0.45); color: rgba(21, 128, 61, 0.95); }
.cell-block-intake-vi { background: rgba(59, 130, 246, 0.20); border-color: rgba(29, 78, 216, 0.45); color: rgba(29, 78, 216, 0.95); }
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
</style>

