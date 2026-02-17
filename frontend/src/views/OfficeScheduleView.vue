<template>
  <div class="office-schedule">
    <div class="header" data-tour="buildings-schedule-header">
      <div>
        <h3 style="margin: 0;" data-tour="buildings-schedule-title">Building Schedule</h3>
        <div class="subtitle" data-tour="buildings-schedule-subtitle">Weekly office grid (7am–9pm).</div>
      </div>
      <div class="controls" data-tour="buildings-schedule-controls">
        <div class="field" data-tour="buildings-schedule-week">
          <label>Week of</label>
          <input v-model="weekStart" type="date" @change="loadGrid" :disabled="!officeId" />
        </div>
        <div class="btn-group">
          <button class="btn btn-secondary btn-sm" @click="goToPreviousWeek" :disabled="loading || !officeId">Previous week</button>
          <button class="btn btn-secondary btn-sm" @click="goToNextWeek" :disabled="loading || !officeId">Next week</button>
          <button class="btn btn-secondary btn-sm" @click="goToCurrentWeek" :disabled="loading || !officeId">Current week</button>
        </div>
        <button class="btn btn-secondary btn-sm" @click="toggleWeekStartMode" :disabled="loading || !officeId">
          {{ weekStartMode === 'MONDAY' ? 'Mon' : 'Sun' }} start
        </button>
        <button
          v-if="canManageSchedule"
          class="btn btn-secondary btn-sm"
          type="button"
          @click="refreshEhrAssignedBookings"
          :disabled="refreshingEhrBookings || !officeId"
        >
          {{ refreshingEhrBookings ? 'Refreshing…' : 'Refresh EHR' }}
        </button>
        <button class="btn btn-secondary btn-sm" @click="loadGrid" :disabled="loading || !officeId">Refresh</button>
      </div>
    </div>

    <div v-if="!officeId" class="muted">Select a building above to view the schedule.</div>
    <div v-else-if="error" class="error-box">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading…</div>
    <div v-if="successToast" class="success-toast">{{ successToast }}</div>

    <div v-else-if="grid" class="grid-wrap" data-tour="buildings-schedule-gridwrap">
      <div class="legend" data-tour="buildings-schedule-legend">
        <div class="legend-item"><span class="dot open"></span> Open</div>
        <div class="legend-item"><span class="dot assigned_available"></span> Assigned available</div>
        <div class="legend-item"><span class="dot assigned_temporary"></span> Assigned temporary</div>
        <div class="legend-item"><span class="dot assigned_booked"></span> Assigned booked</div>
        <div class="legend-item"><span class="dot intake-ip"></span> In-person intake</div>
        <div class="legend-item"><span class="dot intake-v"></span> Virtual intake</div>
        <div class="legend-item"><span class="dot own-slot"></span> Your schedule</div>
      </div>
      <div v-if="cancelledGoogleEvents.length" class="cancelled-google-card">
        <div class="cancelled-google-title">Cancelled slots still linked to Google (cleanup queue)</div>
        <div class="muted" style="margin-bottom: 8px;">
          These were deleted/cancelled in-app. We now auto-delete from Google too; older records are listed here so they can be removed from Google resource calendars if still present.
        </div>
        <div class="cancelled-google-list">
          <div v-for="x in cancelledGoogleEvents" :key="`cge-${x.id}`" class="cancelled-google-row">
            <div>
              <strong>{{ x.roomText }}</strong>
              <div class="muted" style="font-size: 12px;">{{ x.when }}</div>
            </div>
            <div class="cancelled-google-meta">
              <div><strong>Provider cal:</strong> {{ x.googleProviderCalendarId || 'n/a' }}</div>
              <div><strong>Google event id:</strong> {{ x.googleProviderEventId || 'n/a' }}</div>
              <div><strong>Room resource:</strong> {{ x.googleRoomResourceEmail || 'n/a' }}</div>
              <div><strong>Sync:</strong> {{ x.googleSyncStatus || 'unknown' }}</div>
            </div>
            <div>
              <button
                class="btn btn-danger btn-sm"
                type="button"
                :disabled="deletingGoogleEventIds.includes(Number(x.id))"
                @click="deleteFromGoogleNow(x.id)"
              >
                {{ deletingGoogleEventIds.includes(Number(x.id)) ? 'Deleting…' : 'Delete from Google now' }}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div v-if="bulkActionsVisible && !bulkActionsExpanded && !showModal" class="bulk-actions-mini card">
        <div class="bulk-mini-title">Selected: {{ selectedSlots.length }}</div>
        <div class="bulk-mini-actions">
          <button class="btn btn-secondary btn-sm" @click="bulkActionsExpanded = true" :disabled="saving">Open actions</button>
          <button class="btn btn-secondary btn-sm" @click="clearSelection" :disabled="saving">Clear</button>
        </div>
      </div>

      <div v-if="bulkActionsVisible && bulkActionsExpanded && !showModal" class="bulk-actions card">
        <div class="bulk-head">
          <div class="bulk-title">Selected slots: {{ selectedSlots.length }}</div>
          <div class="bulk-head-actions">
            <button class="btn btn-secondary btn-sm" @click="bulkActionsExpanded = false" :disabled="saving">Continue selecting</button>
            <button class="btn btn-secondary btn-sm" @click="clearSelection" :disabled="saving">Clear</button>
          </div>
        </div>
        <div class="bulk-grid">
          <div class="bulk-col">
            <div class="muted">Assign selected open slots</div>
            <PersonSearchSelect
              v-model="bulkProviderId"
              :options="providers"
              placeholder="Type name to search…"
              :disabled="saving"
            />
            <select v-model="bulkAssignRecurrenceFreq" class="select">
              <option value="ONCE">Single occurrence</option>
              <option value="WEEKLY">Weekly</option>
              <option value="BIWEEKLY">Biweekly</option>
            </select>
            <input v-if="bulkAssignRecurrenceFreq !== 'ONCE'" v-model="bulkAssignUntilDate" type="date" class="input" />
            <div v-if="bulkAssignRecurrenceFreq !== 'ONCE'" class="weekday-picker">
              <label class="weekday-label">Days</label>
              <label v-for="wd in weekdayOptions" :key="`bwd-${wd.value}`" class="weekday-check">
                <input type="checkbox" :checked="bulkAssignWeekdays.includes(wd.value)" @change="toggleBulkAssignWeekday(wd.value)" />
                <span>{{ wd.label }}</span>
              </label>
            </div>
            <button class="btn btn-primary" @click="bulkAssignSelected" :disabled="saving || !bulkCanAssign">
              Assign selected
            </button>
          </div>
          <div class="bulk-col">
            <div class="muted">Edit/delete selected assigned slots</div>
            <select v-model="bulkEditRecurrenceFreq" class="select">
              <option value="WEEKLY">Weekly</option>
              <option value="BIWEEKLY">Biweekly</option>
            </select>
            <input v-model="bulkEditRecurrenceUntil" type="date" class="input" />
            <button class="btn btn-secondary" @click="bulkEditRecurrenceSelected" :disabled="saving || !selectedAssignedSlots.length">
              Set recurrence
            </button>
            <button class="btn btn-danger" @click="bulkDeleteSelected" :disabled="saving || !selectedAssignedSlots.length">
              Delete selected
            </button>
          </div>
        </div>
      </div>

      <div v-if="canManageSchedule" class="card avail-search" data-tour="buildings-schedule-avail-search">
        <div class="avail-search-head">
          <div>
            <div class="avail-search-title">Find availability</div>
            <div class="muted">
              Search for open or assigned-available rooms in this building at a given day/time. Shows up to 2 hours before/after if contiguous slots are also available.
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" type="button" @click="runAvailabilitySearch" :disabled="searching">
            Search
          </button>
        </div>

        <div class="avail-search-form">
          <div class="field">
            <label>Date</label>
            <input v-model="searchDate" type="date" :disabled="!officeId || searching" />
          </div>
          <div class="field">
            <label>Start time</label>
            <select v-model.number="searchHour" class="select" :disabled="!grid || searching">
              <option v-for="h in grid.hours" :key="`sh-${h}`" :value="h">{{ formatHour(h) }}</option>
            </select>
          </div>
          <div class="field">
            <label>Include</label>
            <select v-model="searchFilter" class="select" :disabled="!grid || searching">
              <option value="all">Open + assigned available</option>
              <option value="open">Open only</option>
              <option value="assigned">Assigned available only</option>
            </select>
          </div>
          <div class="field">
            <label>Results</label>
            <div class="muted" style="padding-top: 10px;">
              {{ availabilityResults.length }} found
            </div>
          </div>
        </div>

        <div v-if="searchError" class="error-box" style="margin-top: 10px;">{{ searchError }}</div>

        <div v-if="availabilityResults.length" class="avail-results">
          <div v-for="r in availabilityResults" :key="`ar-${r.roomId}`" class="avail-row">
            <div class="avail-room">
              <div class="avail-room-title">
                <strong>{{ r.roomLabel }}</strong>
              </div>
              <div class="muted" style="font-size: 12px;">
                {{ r.date }} • {{ formatHour(r.hour) }}
              </div>
            </div>
            <div class="avail-meta">
              <span class="pill" :class="`pill-${r.state}`">
                {{ r.stateLabel }}{{ r.providerInitials ? ` (${r.providerInitials})` : '' }}
              </span>
              <div class="muted" style="font-size: 12px; margin-top: 4px;">
                Window: {{ formatHour(r.windowStartHour) }}–{{ formatHour(r.windowEndHour) }}
                <span v-if="r.prevHours || r.nextHours">
                  • prev {{ r.prevHours }}h / next {{ r.nextHours }}h
                </span>
              </div>
            </div>
            <div class="avail-actions">
              <button class="btn btn-secondary btn-sm" type="button" @click="jumpToSlot(r.roomId, r.date, r.hour)">
                Jump
              </button>
            </div>
          </div>
        </div>
        <div v-else class="muted" style="margin-top: 10px;">
          No matching availability for this time.
        </div>
      </div>

      <div class="room-nav" data-tour="buildings-schedule-room-nav">
        <label style="font-weight: 800;">Room</label>
        <select v-model.number="selectedRoomId" class="select" :disabled="!grid">
          <option v-for="r in sortedRooms" :key="`room-opt-${r.id}`" :value="Number(r.id)">
            {{ r.roomNumber ? `#${r.roomNumber}` : '' }} {{ r.label || r.name }}
          </option>
        </select>
        <div class="btn-group">
          <button class="btn btn-secondary btn-sm" type="button" @click="prevRoom" :disabled="sortedRooms.length <= 1">Prev</button>
          <button class="btn btn-secondary btn-sm" type="button" @click="nextRoom" :disabled="sortedRooms.length <= 1">Next</button>
        </div>
        <button
          type="button"
          class="btn btn-sm room-toggle"
          :class="{ 'room-toggle-active': singleRoomMode }"
          @click="singleRoomMode = !singleRoomMode"
          :disabled="!grid || sortedRooms.length <= 1"
          title="Show only one room at a time"
        >
          Show one office
        </button>
      </div>

      <div v-for="room in displayedRooms" :key="room.id" class="room-card" data-tour="buildings-schedule-room-card">
        <div class="room-head">
          <div class="room-title">
            <strong>{{ room.roomNumber ? `#${room.roomNumber}` : '' }} {{ room.label || room.name }}</strong>
          </div>
        </div>

        <div class="week-table" data-tour="buildings-schedule-week-table">
          <div class="cell corner"></div>
          <div v-for="d in displayedDays" :key="d" class="cell day-head" :class="{ today: isTodayDate(d) }">
            {{ formatDay(d) }}
          </div>

          <template v-for="h in grid.hours" :key="h">
            <div class="cell hour-head">{{ formatHour(h) }}</div>
            <div
              v-for="d in displayedDays"
              :key="`${room.id}-${d}-${h}`"
              class="cell slot"
              :class="[
                slotClass(room.id, d, h),
                {
                  selected: isSlotSelected(room.id, d, h),
                  'own-provider': isOwnProviderSlot(room.id, d, h),
                  today: isTodayDate(d)
                }
              ]"
              :style="slotStyle(room.id, d, h)"
              :title="slotTitle(room.id, d, h)"
              @mousedown.left.prevent="onSlotMouseDown(room.id, d, h)"
              @mouseenter="onSlotMouseEnter(room.id, d, h)"
              @click="onSlotClick(room.id, d, h)"
            >
              <span class="slot-label">{{ slotDisplayLabel(room.id, d, h) }}</span>
              <span v-if="slotHasLearningLink(room.id, d, h)" class="lp-pill" title="Linked learning billing session">LP</span>
              <span v-if="slotHasInPersonIntake(room.id, d, h)" class="ip-pill" title="In-person intake enabled">IP</span>
              <span v-if="slotHasVirtualIntake(room.id, d, h)" class="vi-pill" title="Virtual intake enabled">VI</span>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Slot actions modal -->
    <div v-if="showModal" class="modal-overlay" @click="closeModal">
      <div class="modal" @click.stop>
        <h3 style="margin-top: 0;">Slot</h3>
        <div class="muted" style="margin-bottom: 10px;">
          {{ modalSlot ? `${modalSlot.date} ${formatHour(modalSlot.hour)} — ${modalSlot.state}` : '' }}
        </div>
        <div class="recurrence-summary" v-if="modalSlot">
          <div><strong>Recurrence:</strong> {{ modalSlot.frequencyLabel || 'One-time' }}</div>
          <div v-if="modalSlot.bookingStartDate"><strong>Starts:</strong> {{ modalSlot.bookingStartDate }}</div>
          <div v-if="modalSlot.bookingActiveUntilDate"><strong>Until:</strong> {{ modalSlot.bookingActiveUntilDate }}</div>
          <div v-if="modalSlot.bookingOccurrenceCount"><strong>Booked occurrences:</strong> {{ modalSlot.bookingOccurrenceCount }}</div>
        </div>
        <div class="slot-details" v-if="modalSlot">
          <div><strong>Assigned to:</strong> {{ providerDisplayName(modalSlot.assignedProviderFullName || modalSlot.assignedProviderName || modalSlot.bookedProviderFullName || modalSlot.bookedProviderName, modalSlot.providerInitials, 'Unassigned') }}</div>
          <div v-if="modalSlot.bookedProviderFullName || modalSlot.bookedProviderName"><strong>Booked for:</strong> {{ providerDisplayName(modalSlot.bookedProviderFullName || modalSlot.bookedProviderName, modalSlot.providerInitials, 'Unassigned') }}</div>
          <div><strong>Event ID:</strong> {{ modalSlot.eventId || 'n/a' }}</div>
          <div><strong>Standing assignment:</strong> {{ modalSlot.standingAssignmentId || 'n/a' }}</div>
          <div v-if="modalSlot.assignmentCreatedAt"><strong>Assigned on:</strong> {{ formatDateTime(modalSlot.assignmentCreatedAt) }}</div>
          <div v-if="modalSlot.assignmentCreatedByName"><strong>Assigned by:</strong> {{ modalSlot.assignmentCreatedByName }}</div>
          <div v-if="modalSlot.assignmentAvailableSinceDate"><strong>Available since:</strong> {{ formatDateOnly(modalSlot.assignmentAvailableSinceDate) }}</div>
          <div v-if="modalSlot.assignmentLastTwoWeekConfirmedAt"><strong>Last 2-week confirmation:</strong> {{ formatDateTime(modalSlot.assignmentLastTwoWeekConfirmedAt) }}</div>
          <div v-if="modalSlot.assignmentConfirmationExpiresAt"><strong>Falls off after:</strong> {{ formatDateOnly(modalSlot.assignmentConfirmationExpiresAt) }}</div>
          <div v-if="Number.isInteger(Number(modalSlot.assignmentTwoWeekWindowsRemaining))">
            <strong>2-week windows remaining:</strong> {{ modalSlot.assignmentTwoWeekWindowsRemaining }} / 3
          </div>
          <div v-if="modalSlot.bookingCreatedAt"><strong>Booking plan created:</strong> {{ formatDateTime(modalSlot.bookingCreatedAt) }}</div>
          <div v-if="modalSlot.bookingCreatedByName"><strong>Booking plan set by:</strong> {{ modalSlot.bookingCreatedByName }}</div>
          <div v-if="modalSlot.bookingLastConfirmedAt"><strong>Last booked confirmation:</strong> {{ formatDateTime(modalSlot.bookingLastConfirmedAt) }}</div>
          <div class="muted">Rule reminder: providers confirm every 2 weeks; assignments auto-fall off after 6 weeks (~3 windows) without confirmation.</div>
        </div>

        <div v-if="modalSlot?.state === 'open'">
          <div v-if="canManageSchedule" class="section">
            <div class="section-title">Staff/admin action</div>
            <div class="muted" style="margin-bottom: 8px;">
              Assigning creates a one-time building room assignment for the selected time range.
            </div>

            <div class="row">
              <label style="font-weight: 700;">Person</label>
              <PersonSearchSelect
                v-model="selectedProviderId"
                :options="providers"
                placeholder="Type name to search…"
                :disabled="saving"
              />
              <label style="font-weight: 700;">End</label>
              <select v-model.number="assignEndHour" class="select" :disabled="!modalSlot">
                <option v-for="h in assignEndHourOptions" :key="`end-${h}`" :value="h">
                  {{ formatHour(h) }}
                </option>
              </select>
              <label style="font-weight: 700;">Recurrence</label>
              <select v-model="assignRecurrenceFreq" class="select" :disabled="!modalSlot">
                <option value="ONCE">Single occurrence</option>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Biweekly</option>
              </select>
              <label class="check" style="align-self: center;">
                <input type="checkbox" v-model="assignTemporary4Weeks" :disabled="assignRecurrenceFreq === 'ONCE'" />
                <span>Temporary 4-week hold</span>
              </label>
              <div v-if="assignTemporary4Weeks && assignRecurrenceFreq !== 'ONCE'" class="muted" style="max-width: 320px;">
                Temporary hold while trying to place a client. If booked during hold, this converts to regular assigned office.
              </div>
              <label v-if="assignRecurrenceFreq !== 'ONCE'" style="font-weight: 700;">Recurring until</label>
              <input
                v-if="assignRecurrenceFreq !== 'ONCE'"
                v-model="assignRecurringUntilDate"
                type="date"
                class="input"
                :disabled="!modalSlot"
              />
              <div v-if="assignRecurrenceFreq !== 'ONCE'" class="weekday-picker">
                <label class="weekday-label">Days</label>
                <label v-for="wd in weekdayOptions" :key="`wd-${wd.value}`" class="weekday-check">
                  <input
                    type="checkbox"
                    :checked="assignWeekdays.includes(wd.value)"
                    @change="toggleAssignWeekday(wd.value)"
                  />
                  <span>{{ wd.label }}</span>
                </label>
              </div>
              <button
                class="btn btn-primary"
                @click="assignOpenSlot"
                :disabled="saving || !canAssignSubmit"
                :title="assignDisabledReason || ''"
              >
                Assign
              </button>
            </div>
          </div>

          <div v-else class="muted">
            Building room slots are not assignable for your role.
          </div>
        </div>

        <template v-else>
          <div class="section" v-if="canToggleVirtualIntake">
            <div class="section-title">Intake availability</div>
            <div class="muted" style="margin-bottom: 8px;">
              In-person intake:
              <strong>{{ modalInPersonIntakeEnabled ? 'Enabled' : 'Disabled' }}</strong>
              <span> (this hour only)</span>
            </div>
            <div class="row" style="margin-bottom: 8px;">
              <button
                class="btn btn-secondary"
                @click="enableInPersonIntake"
                :disabled="saving || !canToggleInPersonIntake || modalInPersonIntakeEnabled"
              >
                Enable in-person intake
              </button>
              <button
                class="btn btn-secondary"
                @click="disableInPersonIntake"
                :disabled="saving || !canToggleInPersonIntake || !modalInPersonIntakeEnabled"
              >
                Disable in-person intake
              </button>
            </div>
            <div class="muted" style="margin: 8px 0 6px;">
              Virtual intake (this hour only):
              <strong>{{ modalVirtualIntakeEnabled ? 'Enabled' : 'Disabled' }}</strong>
            </div>
            <div class="row">
              <button
                class="btn btn-secondary"
                @click="enableVirtualIntake"
                :disabled="saving || !modalSlot?.eventId || modalVirtualIntakeEnabled"
                title="Enable virtual intake for this hour."
              >
                Enable virtual intake
              </button>
              <button
                class="btn btn-secondary"
                @click="disableVirtualIntake"
                :disabled="saving || !modalSlot?.eventId || !modalVirtualIntakeEnabled"
                title="Removes intake designation but keeps the slot virtually available."
              >
                Disable virtual intake (keep virtual available)
              </button>
            </div>
          </div>

          <div class="section" v-if="canSelfManageModalSlot">
            <div class="section-title">Provider actions</div>
            <div class="status-chip" :class="modalSlot?.state === 'assigned_booked' ? 'status-booked' : 'status-assigned'">
              {{ modalSlot?.state === 'assigned_booked' ? 'Currently booked' : 'Currently assigned (not booked)' }}
            </div>

            <div class="row">
              <label style="font-weight: 700;">Book frequency</label>
              <select v-model="bookFreq">
                <option value="">Select…</option>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Biweekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
              <label style="font-weight: 700;">Occurrences</label>
              <input v-model.number="bookOccurrenceCount" type="number" min="1" max="104" class="input" style="width: 90px;" />
              <button class="btn btn-primary" @click="bookSlot" :disabled="saving || !bookFreq || (!modalSlot?.standingAssignmentId && !modalSlot?.eventId)">
                Book
              </button>
            </div>

            <div class="row" style="margin-top: 10px;">
              <div class="muted">Assigned slots require a quick confirmation every 2 weeks, and unconfirmed assignments fall off after 6 weeks.</div>
              <button class="btn btn-secondary" @click="keepAvailable" :disabled="saving || !modalSlot?.standingAssignmentId">
                Confirm assigned slot
              </button>
            </div>

            <div class="row" style="margin-top: 10px;">
              <button class="btn btn-secondary" @click="staffBook(true)" :disabled="saving || !modalSlot?.eventId">
                Set booked (this occurrence)
              </button>
              <button class="btn btn-secondary" @click="staffBook(false)" :disabled="saving || !modalSlot?.eventId || isAssignedUnbooked">
                Set unbooked (this occurrence)
              </button>
            </div>

            <div class="row" style="margin-top: 10px;">
              <select v-model="forfeitScope" class="select" :disabled="saving || (!modalSlot?.eventId && !modalSlot?.standingAssignmentId)">
                <option value="occurrence">Forfeit this occurrence only</option>
                <option value="future" :disabled="!isRecurringSlot">Forfeit this and all future recurring</option>
              </select>
              <label class="check">
                <input type="checkbox" v-model="ackForfeit" />
                <span>I understand this slot's day/time/frequency is forfeit at this time and available to others.</span>
              </label>
              <button class="btn btn-danger" @click="forfeit" :disabled="saving || !ackForfeit || (!modalSlot?.eventId && !modalSlot?.standingAssignmentId)">
                Forfeit
              </button>
            </div>
          </div>
          <div class="section" v-else>
            <div class="muted">This slot can only be edited by the assigned provider or schedule managers.</div>
          </div>

          <div class="section" v-if="canManageSchedule">
            <div class="section-title">Staff/admin action</div>
            <div class="muted" style="margin-bottom: 8px;">
              Edit recurrence for this slot.
            </div>
            <div class="row" style="margin-bottom: 8px;">
              <button class="btn btn-secondary" @click="setTemporary" :disabled="saving || !modalSlot?.standingAssignmentId">
                Set temporary (4 weeks)
              </button>
              <div class="muted">
                Temporary hold while trying to place a client. If booked, it converts to regular assigned office.
              </div>
            </div>
            <div class="row">
              <label style="font-weight: 700;">Recurrence</label>
              <select v-model="editRecurrenceFreq" class="select" :disabled="saving || (!modalSlot?.standingAssignmentId && !modalSlot?.eventId)">
                <option value="">Select…</option>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Biweekly</option>
              </select>
              <label style="font-weight: 700;">Until</label>
              <input
                v-model="editRecurrenceUntil"
                type="date"
                class="input"
                :disabled="saving || !editRecurrenceFreq || (!modalSlot?.standingAssignmentId && !modalSlot?.eventId)"
              />
              <button
                class="btn btn-secondary"
                @click="saveRecurrence"
                :disabled="saving || !editRecurrenceFreq || (!modalSlot?.standingAssignmentId && !modalSlot?.eventId)"
              >
                Save recurrence
              </button>
            </div>
            <div class="muted" style="margin-bottom: 8px;">
              Booking converts this occurrence to assigned_booked immediately (no approval gate).
            </div>
            <div class="row">
              <button class="btn btn-primary" @click="staffBook(true)" :disabled="saving || !modalSlot?.eventId">
                Mark booked (this occurrence)
              </button>
            </div>
            <div class="muted" style="margin: 14px 0 6px;">
              Link this booked office event to a learning billing session.
            </div>
            <div class="row">
              <label style="font-weight: 700;">Client</label>
              <select v-model.number="selectedLearningClientId" class="select" :disabled="saving || creatingLearningSession || !learningClients.length">
                <option :value="0">Select client…</option>
                <option v-for="c in learningClients" :key="`lcli-${c.id}`" :value="Number(c.id)">
                  {{ c.label }}
                </option>
              </select>
              <label style="font-weight: 700;">Service</label>
              <select v-model.number="selectedLearningServiceId" class="select" :disabled="saving || creatingLearningSession || !learningServices.length">
                <option :value="0">Optional service…</option>
                <option v-for="s in learningServices" :key="`lsvc-${s.id}`" :value="Number(s.id)">
                  {{ s.name }}
                </option>
              </select>
              <label style="font-weight: 700;">Payment mode</label>
              <select v-model="learningPaymentMode" class="select" :disabled="saving || creatingLearningSession">
                <option value="PAY_PER_EVENT">Pay per event</option>
                <option value="TOKEN">Token</option>
                <option value="SUBSCRIPTION">Subscription</option>
              </select>
              <button
                class="btn btn-secondary"
                type="button"
                @click="createLearningSessionFromModal"
                :disabled="!canCreateLearningSession"
              >
                {{ creatingLearningSession ? 'Linking…' : (modalSlot?.learningLinked ? 'Re-link check' : 'Create learning session + charge') }}
              </button>
            </div>
            <div class="muted" v-if="modalSlot?.learningLinked">
              This slot is already linked to learning session #{{ modalSlot?.learningSessionId || '?' }}.
            </div>
            <div class="muted" style="margin: 14px 0 6px;">
              Remove from schedule.
            </div>
            <div class="row">
              <select v-model="cancelScope" class="select" :disabled="saving || (!modalSlot?.eventId && !modalSlot?.standingAssignmentId)">
                <option value="occurrence">This occurrence only</option>
                <option value="future_day" :disabled="!isRecurringSlot">This day only, future occurrences</option>
                <option value="week" :disabled="!isRecurringSlot">This week only</option>
                <option value="future_set" :disabled="!isRecurringSlot">This and all future recurring (entire set)</option>
                <option value="until" :disabled="!isRecurringSlot">Pause until date (e.g., holiday break)</option>
              </select>
              <input
                v-if="cancelScope === 'until'"
                v-model="cancelUntilDate"
                type="date"
                class="input"
                :disabled="saving || (!modalSlot?.eventId && !modalSlot?.standingAssignmentId)"
              />
              <button class="btn btn-danger" @click="cancelEventAction" :disabled="saving || (!modalSlot?.eventId && !modalSlot?.standingAssignmentId)">
                Delete event
              </button>
            </div>
            <div class="row" v-if="isSuperAdmin" style="margin-top: 10px;">
              <button class="btn btn-danger" type="button" @click="purgeFutureBookedSlot" :disabled="purgingFuture || !modalSlot?.eventId">
                {{ purgingFuture ? 'Purging…' : 'Purge future booked (provider + slot)' }}
              </button>
              <div class="muted">Emergency cleanup for this provider + room + day/time from this date forward.</div>
            </div>
          </div>
        </template>

        <div class="actions">
          <button class="btn btn-secondary" @click="closeModal" :disabled="saving">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import PersonSearchSelect from '../components/schedule/PersonSearchSelect.vue';
const route = useRoute();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const officeId = computed(() => (typeof route.query.officeId === 'string' ? route.query.officeId : ''));
const currentAgencyId = computed(() => Number(agencyStore.currentAgency?.id || 0) || null);

const loading = ref(false);
const refreshingEhrBookings = ref(false);
const error = ref('');
const grid = ref(null);
const weekStart = ref(new Date().toISOString().slice(0, 10));

const searching = ref(false);
const searchError = ref('');
const searchDate = ref(new Date().toISOString().slice(0, 10));
const searchHour = ref(9);
const searchFilter = ref('all'); // all | open | assigned
const weekStartMode = ref(
  typeof window !== 'undefined' && window.localStorage.getItem('schedule.weekStartMode') === 'SUNDAY' ? 'SUNDAY' : 'MONDAY'
);
const availabilityResults = ref([]);
const selectedSlotKeys = ref([]);
const dragAnchor = ref(null);
const draggingSelection = ref(false);
const suppressNextClick = ref(false);
const bulkActionsExpanded = ref(false);
const bulkActionsVisible = ref(false);
let bulkActionsDelayTimer = null;

const formatDay = (d) => {
  try {
    const dt = new Date(`${d}T00:00:00`);
    return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return d;
  }
};

const formatHour = (h) => {
  const hour = Number(h);
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric' });
};

const formatDateOnly = (value) => {
  const raw = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return value || '';
  const dt = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return raw;
  return dt.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatDateTime = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const dt = new Date(normalized);
  if (Number.isNaN(dt.getTime())) return raw.slice(0, 16).replace('T', ' ');
  return dt.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const providerDisplayName = (name, initials = null, fallback = 'Unknown') => {
  const full = String(name || '').trim();
  if (full) return full;
  const short = String(initials || '').trim();
  if (short) return `Initials ${short}`;
  return fallback;
};

const slotMap = computed(() => {
  const m = new Map();
  const slots = grid.value?.slots || [];
  for (const s of slots) {
    m.set(`${s.roomId}:${s.date}:${s.hour}`, s);
  }
  return m;
});

const getSlot = (roomId, date, hour) => slotMap.value.get(`${roomId}:${date}:${hour}`) || null;
const cancelledGoogleEvents = computed(() => {
  const rows = Array.isArray(grid.value?.cancelledGoogleEvents) ? grid.value.cancelledGoogleEvents : [];
  return rows.map((x) => {
    const roomText = `${x?.roomNumber ? `#${x.roomNumber} ` : ''}${x?.roomLabel || `Room ${x?.roomId || ''}`}`.trim();
    const start = String(x?.startAt || '').replace('T', ' ').slice(0, 16);
    const end = String(x?.endAt || '').replace('T', ' ').slice(11, 16);
    return {
      ...x,
      roomText,
      when: start && end ? `${start} - ${end}` : (start || '')
    };
  });
});

const isAvailableState = (state) => {
  const s = String(state || '');
  return s === 'open' || s === 'assigned_available' || s === 'assigned_temporary';
};
const isOpenState = (state) => String(state || '') === 'open';
const isAssignedAvailableState = (state) => {
  const s = String(state || '');
  return s === 'assigned_available' || s === 'assigned_temporary';
};

const roomLabel = (roomId) => {
  const r = (grid.value?.rooms || []).find((x) => Number(x.id) === Number(roomId));
  if (!r) return `Room ${roomId}`;
  const num = r.roomNumber ? `#${r.roomNumber} ` : '';
  return `${num}${r.label || r.name || ''}`.trim();
};

const stateLabel = (state) => {
  const s = String(state || '');
  if (s === 'open') return 'Open';
  if (s === 'assigned_available') return 'Assigned available';
  if (s === 'assigned_temporary') return 'Assigned temporary';
  if (s === 'assigned_booked') return 'Booked';
  return s || 'Unknown';
};

const slotClass = (roomId, date, hour) => {
  const s = getSlot(roomId, date, hour);
  return s?.state || 'open';
};

const slotInitials = (roomId, date, hour) => {
  const s = getSlot(roomId, date, hour);
  return s?.providerInitials || '';
};

const slotDisplayLabel = (roomId, date, hour) => {
  const s = getSlot(roomId, date, hour);
  if (!s) return '';
  const full =
    String(s?.bookedProviderFullName || s?.bookedProviderName || s?.assignedProviderFullName || s?.assignedProviderName || '').trim();
  if (full) return full;
  return String(s?.providerInitials || '').trim();
};

const slotTitle = (roomId, date, hour) => {
  const s = getSlot(roomId, date, hour);
  if (!s) return '';
  const inPersonLabel = slotHasInPersonIntake(roomId, date, hour) ? ' • in-person intake on' : '';
  const virtualLabel = s?.virtualIntakeEnabled ? ' • virtual intake on' : '';
  const ownLabel = isOwnProviderSlot(roomId, date, hour) ? ' • your schedule' : '';
  const providerLabel = providerDisplayName(
    s?.bookedProviderFullName || s?.bookedProviderName || s?.assignedProviderFullName || s?.assignedProviderName,
    s?.providerInitials,
    ''
  );
  return `${date} ${formatHour(hour)} — ${s.state}${providerLabel ? ` • ${providerLabel}` : ''}${inPersonLabel}${virtualLabel}${ownLabel}`;
};

const slotHasVirtualIntake = (roomId, date, hour) => {
  const s = getSlot(roomId, date, hour);
  return Boolean(s?.virtualIntakeEnabled);
};
const slotHasLearningLink = (roomId, date, hour) => {
  const s = getSlot(roomId, date, hour);
  return Boolean(s?.learningLinked);
};
const slotHasInPersonIntake = (roomId, date, hour) => {
  const s = getSlot(roomId, date, hour);
  return Boolean(s?.inPersonIntakeEnabled);
};
const isOwnProviderSlot = (roomId, date, hour) => {
  const s = getSlot(roomId, date, hour);
  const pid = Number(s?.providerId || 0);
  return pid > 0 && pid === currentUserId.value;
};

const stableColorForId = (id) => {
  const n = Number(id || 0);
  if (!n) return null;
  // Deterministic HSL palette based on id
  const hue = (n * 47) % 360;
  return `hsl(${hue} 70% 45%)`;
};

const slotStyle = (roomId, date, hour) => {
  const s = getSlot(roomId, date, hour);
  const pid = Number(s?.providerId || 0);
  if (!pid) return {};
  const c = stableColorForId(pid);
  if (!c) return {};
  return {
    borderLeft: `5px solid ${c}`
  };
};

const slotKey = (roomId, date, hour) => `${Number(roomId)}:${String(date)}:${Number(hour)}`;
const parseSlotKey = (k) => {
  const [roomId, date, hour] = String(k || '').split(':');
  return { roomId: Number(roomId), date, hour: Number(hour) };
};
const isSlotSelected = (roomId, date, hour) => selectedSlotKeys.value.includes(slotKey(roomId, date, hour));
const selectedSlots = computed(() => {
  const out = [];
  for (const key of selectedSlotKeys.value) {
    const parsed = parseSlotKey(key);
    const s = getSlot(parsed.roomId, parsed.date, parsed.hour);
    if (s) out.push(s);
  }
  return out;
});
const selectedOpenSlots = computed(() => selectedSlots.value.filter((s) => String(s?.state || '') === 'open'));
const selectedAssignedSlots = computed(() => selectedSlots.value.filter((s) => String(s?.state || '') !== 'open'));

const addDaysYmd = (ymd, days) => {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo, d));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return dt.toISOString().slice(0, 10);
};

const startOfWeekForMode = (ymd, mode = weekStartMode.value) => {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const day = dt.getUTCDay(); // 0..6
  const offset = mode === 'SUNDAY' ? day : (day + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - offset);
  return dt.toISOString().slice(0, 10);
};

const todayLocalYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const goToCurrentWeek = async () => {
  weekStart.value = startOfWeekForMode(todayLocalYmd(), weekStartMode.value);
  await loadGrid();
};

const toggleWeekStartMode = async () => {
  weekStartMode.value = weekStartMode.value === 'MONDAY' ? 'SUNDAY' : 'MONDAY';
  if (typeof window !== 'undefined') window.localStorage.setItem('schedule.weekStartMode', weekStartMode.value);
  weekStart.value = startOfWeekForMode(weekStart.value, weekStartMode.value);
  await loadGrid();
};

const isTodayDate = (ymd) => String(ymd || '').slice(0, 10) === todayLocalYmd();

const goToNextWeek = async () => {
  const next = addDaysYmd(weekStart.value, 7);
  weekStart.value = next;
  await loadGrid();
};

const goToPreviousWeek = async () => {
  const prev = addDaysYmd(weekStart.value, -7);
  weekStart.value = prev;
  await loadGrid();
};

const loadGrid = async () => {
  if (!officeId.value) return;
  try {
    loading.value = true;
    error.value = '';
    const normalizedWeekStart = startOfWeekForMode(weekStart.value, weekStartMode.value);
    weekStart.value = normalizedWeekStart;
    const resp = await api.get(`/office-schedule/locations/${officeId.value}/weekly-grid`, { params: { weekStart: normalizedWeekStart } });
    grid.value = resp.data;
    selectedSlotKeys.value = [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load weekly grid';
  } finally {
    loading.value = false;
  }
};

const refreshEhrAssignedBookings = async () => {
  if (!officeId.value) return;
  try {
    refreshingEhrBookings.value = true;
    error.value = '';
    const resp = await api.post(`/office-schedule/locations/${officeId.value}/refresh-ehr-assigned-bookings`, {});
    const booked = Number(resp?.data?.bookedFromEhr || 0);
    const scanned = Number(resp?.data?.scannedAssigned || 0);
    setSuccessToast(`EHR refresh complete: ${booked} booked from ${scanned} assigned slot${scanned === 1 ? '' : 's'}.`);
    await loadGrid();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to refresh EHR/assigned room booking';
  } finally {
    refreshingEhrBookings.value = false;
  }
};

const runAvailabilitySearch = async () => {
  if (!officeId.value) return;
  if (!grid.value) return;
  const date = String(searchDate.value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    searchError.value = 'Date must be YYYY-MM-DD';
    return;
  }
  const hour = Number(searchHour.value);
  const hours = (grid.value?.hours || []).map((h) => Number(h));
  if (!hours.includes(hour)) {
    searchError.value = 'Invalid hour';
    return;
  }

  try {
    searching.value = true;
    searchError.value = '';

    // Ensure the currently loaded grid contains the target date; if not, reload the week for that date.
    if (!Array.isArray(grid.value?.days) || !grid.value.days.includes(date)) {
      weekStart.value = date; // backend normalizes to Monday
      await loadGrid();
    }

    const rooms = sortedRooms.value || [];
    const maxSpan = 2;
    const results = [];

    for (const room of rooms) {
      const s0 = getSlot(room.id, date, hour);
      const st = String(s0?.state || '');
      if (!isAvailableState(st)) continue;

      if (searchFilter.value === 'open' && !isOpenState(st)) continue;
      if (searchFilter.value === 'assigned' && !isAssignedAvailableState(st)) continue;

      let prev = 0;
      for (let i = 1; i <= maxSpan; i++) {
        const h = hour - i;
        if (!hours.includes(h)) break;
        const s = getSlot(room.id, date, h);
        if (!isAvailableState(s?.state)) break;
        prev++;
      }
      let next = 0;
      for (let i = 1; i <= maxSpan; i++) {
        const h = hour + i;
        if (!hours.includes(h)) break;
        const s = getSlot(room.id, date, h);
        if (!isAvailableState(s?.state)) break;
        next++;
      }

      results.push({
        roomId: room.id,
        roomLabel: roomLabel(room.id),
        date,
        hour,
        state: st,
        stateLabel: stateLabel(st),
        providerInitials: s0?.providerInitials || null,
        prevHours: prev,
        nextHours: next,
        windowStartHour: hour - prev,
        windowEndHour: hour + next + 1
      });
    }

    const stateRank = (s) => (s === 'open' ? 0 : 1);
    results.sort((a, b) => {
      const ra = stateRank(a.state);
      const rb = stateRank(b.state);
      if (ra !== rb) return ra - rb;
      const wa = (a.prevHours || 0) + (a.nextHours || 0);
      const wb = (b.prevHours || 0) + (b.nextHours || 0);
      if (wa !== wb) return wb - wa;
      return String(a.roomLabel || '').localeCompare(String(b.roomLabel || ''));
    });

    availabilityResults.value = results;
  } catch (e) {
    availabilityResults.value = [];
    searchError.value = e?.response?.data?.error?.message || 'Failed to search availability';
  } finally {
    searching.value = false;
  }
};

const jumpToSlot = (roomId, date, hour) => {
  singleRoomMode.value = true;
  selectedRoomId.value = Number(roomId);
  if (String(weekStart.value || '').slice(0, 10) !== String(date || '').slice(0, 10)) {
    weekStart.value = String(date || '').slice(0, 10);
    void loadGrid();
  }
  const s = getSlot(roomId, date, hour);
  modalSlot.value = s ? { ...s, roomId, date, hour } : { roomId, date, hour, state: 'open' };
  showModal.value = true;
};

const canManageSchedule = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return ['clinical_practice_assistant', 'admin', 'super_admin', 'superadmin', 'support', 'staff'].includes(role);
});
const isSuperAdmin = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');
const currentUserId = computed(() => Number(authStore.user?.id || 0));

const sortedRooms = computed(() => {
  const rooms = (grid.value?.rooms || []).slice();
  const numVal = (r) => {
    const n = r?.roomNumber ?? r?.room_number ?? null;
    const parsed = parseInt(n, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };
  rooms.sort((a, b) => {
    const an = numVal(a);
    const bn = numVal(b);
    if (an !== null && bn !== null && an !== bn) return an - bn;
    if (an !== null && bn === null) return -1;
    if (an === null && bn !== null) return 1;
    const al = String(a?.label || a?.name || '').toLowerCase();
    const bl = String(b?.label || b?.name || '').toLowerCase();
    return al.localeCompare(bl);
  });
  return rooms;
});

const singleRoomMode = ref(false);
const selectedRoomId = ref(0);
const displayedRooms = computed(() => {
  const rooms = sortedRooms.value || [];
  if (!rooms.length) return [];
  const id = Number(selectedRoomId.value || 0) || Number(rooms[0].id);
  const idx = rooms.findIndex((r) => Number(r.id) === id);
  const selectedIdx = idx >= 0 ? idx : 0;
  if (!singleRoomMode.value) {
    // Keep "all offices" visible, but rotate order so Prev/Next changes which office appears first.
    return selectedIdx === 0 ? rooms : [...rooms.slice(selectedIdx), ...rooms.slice(0, selectedIdx)];
  }
  const found = rooms[selectedIdx] || rooms[0];
  return found ? [found] : [];
});
const displayedDays = computed(() => {
  const base = Array.isArray(grid.value?.days) ? grid.value.days.slice() : [];
  if (!base.length) return [];
  const order = weekStartMode.value === 'SUNDAY' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
  const rank = new Map(order.map((d, idx) => [d, idx]));
  return base.sort((a, b) => {
    const aw = weekdayFromYmd(a);
    const bw = weekdayFromYmd(b);
    return (rank.get(aw) ?? 99) - (rank.get(bw) ?? 99);
  });
});

watch(sortedRooms, (rooms) => {
  if (!Array.isArray(rooms) || !rooms.length) return;
  const current = Number(selectedRoomId.value || 0);
  const exists = rooms.some((r) => Number(r.id) === current);
  if (!current || !exists) selectedRoomId.value = Number(rooms[0].id);
}, { immediate: true });

const prevRoom = () => {
  const rooms = sortedRooms.value || [];
  if (rooms.length <= 1) return;
  const cur = Number(selectedRoomId.value || rooms[0].id);
  const idx = rooms.findIndex((r) => Number(r.id) === cur);
  const nextIdx = idx <= 0 ? rooms.length - 1 : idx - 1;
  selectedRoomId.value = Number(rooms[nextIdx].id);
};
const nextRoom = () => {
  const rooms = sortedRooms.value || [];
  if (rooms.length <= 1) return;
  const cur = Number(selectedRoomId.value || rooms[0].id);
  const idx = rooms.findIndex((r) => Number(r.id) === cur);
  const nextIdx = idx < 0 || idx >= rooms.length - 1 ? 0 : idx + 1;
  selectedRoomId.value = Number(rooms[nextIdx].id);
};

const showModal = ref(false);
const modalSlot = ref(null);
const saving = ref(false);
const purgingFuture = ref(false);
const deletingGoogleEventIds = ref([]);
const successToast = ref('');
let successToastTimer = null;
const bookFreq = ref('');
const bookOccurrenceCount = ref(6);
const editRecurrenceFreq = ref('');
const editRecurrenceUntil = ref('');
const ackForfeit = ref(false);
const cancelScope = ref('occurrence');
const cancelUntilDate = ref('');
const forfeitScope = ref('occurrence');

const providers = ref([]);
const selectedProviderId = ref(0);
const learningClients = ref([]);
const learningServices = ref([]);
const selectedLearningClientId = ref(0);
const selectedLearningServiceId = ref(0);
const learningPaymentMode = ref('PAY_PER_EVENT');
const creatingLearningSession = ref(false);
const assignEndHour = ref(8);
const assignRecurrenceFreq = ref('ONCE');
const assignTemporary4Weeks = ref(false);
const assignRecurringUntilDate = ref('');
const assignWeekdays = ref([]);
const weekdayOptions = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' }
];
const bulkProviderId = ref(0);
const bulkAssignRecurrenceFreq = ref('ONCE');
const bulkAssignUntilDate = ref(addDaysYmd(new Date().toISOString().slice(0, 10), 364));
const bulkAssignWeekdays = ref([]);
const bulkEditRecurrenceFreq = ref('WEEKLY');
const bulkEditRecurrenceUntil = ref(addDaysYmd(new Date().toISOString().slice(0, 10), 364));
const assignEndHourOptions = computed(() => {
  const start = Number(modalSlot.value?.hour ?? 0);
  const out = [];
  // Grid is 7..21 so end is max 22
  for (let h = start + 1; h <= 22; h++) out.push(h);
  return out;
});
const canAssignSubmit = computed(() => {
  if (!selectedProviderId.value || !modalSlot.value?.roomId) return false;
  if (assignRecurrenceFreq.value === 'ONCE') return true;
  return Array.isArray(assignWeekdays.value) && assignWeekdays.value.length > 0;
});
const bulkCanAssign = computed(() => {
  if (!selectedOpenSlots.value.length) return false;
  if (!bulkProviderId.value) return false;
  if (bulkAssignRecurrenceFreq.value === 'ONCE') return true;
  return Array.isArray(bulkAssignWeekdays.value) && bulkAssignWeekdays.value.length > 0;
});
const assignDisabledReason = computed(() => {
  if (saving.value) return 'Saving...';
  if (!officeId.value) return 'Select an office first.';
  if (!modalSlot.value?.roomId) return 'Select an open slot.';
  if (!selectedProviderId.value) return 'Select a provider before assigning.';
  if (assignRecurrenceFreq.value !== 'ONCE' && (!Array.isArray(assignWeekdays.value) || !assignWeekdays.value.length)) {
    return 'Select at least one weekday for recurring assignment.';
  }
  return '';
});
const loadProviders = async () => {
  if (!canManageSchedule.value) return;
  if (!officeId.value) {
    providers.value = [];
    return;
  }
  try {
    const r = await api.get(`/office-schedule/locations/${officeId.value}/providers`);
    const rows = Array.isArray(r.data) ? r.data : [];
    providers.value = rows;
  } catch {
    providers.value = [];
  }
};

const loadLearningBillingOptions = async () => {
  const aid = Number(currentAgencyId.value || 0);
  if (!aid || !canManageSchedule.value) {
    learningClients.value = [];
    learningServices.value = [];
    return;
  }
  try {
    const [clientsResp, servicesResp] = await Promise.all([
      api.get('/clients', { params: { agency_id: aid } }),
      api.get('/learning-billing/services', { params: { agencyId: aid } })
    ]);
    const rawClients = Array.isArray(clientsResp?.data) ? clientsResp.data : [];
    const rawServices = Array.isArray(servicesResp?.data?.services) ? servicesResp.data.services : [];
    learningClients.value = rawClients
      .map((c) => ({
        id: Number(c.id || 0),
        label: String(c.full_name || c.initials || `Client ${c.id}`)
      }))
      .filter((c) => c.id > 0)
      .sort((a, b) => a.label.localeCompare(b.label));
    learningServices.value = rawServices
      .map((s) => ({ id: Number(s.id || 0), name: String(s.name || '').trim() || `Service ${s.id}` }))
      .filter((s) => s.id > 0);
  } catch {
    learningServices.value = [];
    learningClients.value = [];
  }
};

const closeModal = () => {
  showModal.value = false;
  modalSlot.value = null;
  bookFreq.value = '';
  bookOccurrenceCount.value = 6;
  editRecurrenceFreq.value = '';
  ackForfeit.value = false;
  cancelScope.value = 'occurrence';
  cancelUntilDate.value = '';
  forfeitScope.value = 'occurrence';
  selectedProviderId.value = 0;
  assignEndHour.value = 8;
  assignRecurrenceFreq.value = 'ONCE';
  assignTemporary4Weeks.value = false;
  assignRecurringUntilDate.value = '';
  assignWeekdays.value = [];
  editRecurrenceUntil.value = '';
  selectedLearningClientId.value = 0;
  selectedLearningServiceId.value = 0;
  learningPaymentMode.value = 'PAY_PER_EVENT';
  creatingLearningSession.value = false;
};

const clearSelection = () => {
  selectedSlotKeys.value = [];
  dragAnchor.value = null;
  draggingSelection.value = false;
  bulkActionsVisible.value = false;
  bulkActionsExpanded.value = false;
};

const setSuccessToast = (message) => {
  successToast.value = String(message || '').trim();
  if (successToastTimer) clearTimeout(successToastTimer);
  successToastTimer = setTimeout(() => {
    successToast.value = '';
  }, 2600);
};

const deleteFromGoogleNow = async (eventId) => {
  const eid = Number(eventId || 0);
  if (!officeId.value || !eid) return;
  if (deletingGoogleEventIds.value.includes(eid)) return;
  try {
    deletingGoogleEventIds.value = [...deletingGoogleEventIds.value, eid];
    error.value = '';
    await api.post(`/office-slots/${officeId.value}/events/${eid}/google-delete-now`, {});
    setSuccessToast('Google event cleanup requested.');
    await loadGrid();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to delete event from Google';
  } finally {
    deletingGoogleEventIds.value = deletingGoogleEventIds.value.filter((id) => id !== eid);
  }
};

const onSlotClick = (roomId, date, hour) => {
  if (suppressNextClick.value) {
    suppressNextClick.value = false;
    return;
  }
  const s = getSlot(roomId, date, hour);
  if (!s) return;
  modalSlot.value = s;
  bookFreq.value = String(s?.bookedFrequency || '').toUpperCase();
  bookOccurrenceCount.value = Number(s?.bookingOccurrenceCount || 6);
  editRecurrenceFreq.value = String(s?.bookedFrequency || s?.assignedFrequency || 'WEEKLY').toUpperCase();
  editRecurrenceUntil.value = String(s?.bookingActiveUntilDate || addDaysYmd(String(s?.date || ''), 364) || '');
  showModal.value = true;
  cancelScope.value = 'occurrence';
  cancelUntilDate.value = addDaysYmd(String(date || ''), 14);
  forfeitScope.value = 'occurrence';
  assignEndHour.value = Number(hour) + 1;
  assignRecurringUntilDate.value = addDaysYmd(String(date || ''), 364);
  assignRecurrenceFreq.value = 'ONCE';
  assignTemporary4Weeks.value = false;
  const clickedWeekday = weekdayFromYmd(String(date || ''));
  assignWeekdays.value = Number.isInteger(clickedWeekday) ? [clickedWeekday] : [];
  void loadProviders();
  void loadLearningBillingOptions();
};

const dragSelectionKeys = (anchor, current) => {
  if (!grid.value || !anchor || !current) return [];
  if (Number(anchor.roomId) !== Number(current.roomId)) return [slotKey(anchor.roomId, anchor.date, anchor.hour)];
  const days = displayedDays.value || [];
  const d1 = days.indexOf(anchor.date);
  const d2 = days.indexOf(current.date);
  if (d1 < 0 || d2 < 0) return [slotKey(anchor.roomId, anchor.date, anchor.hour)];
  const minDay = Math.min(d1, d2);
  const maxDay = Math.max(d1, d2);
  const minHour = Math.min(Number(anchor.hour), Number(current.hour));
  const maxHour = Math.max(Number(anchor.hour), Number(current.hour));
  const keys = [];
  for (let di = minDay; di <= maxDay; di++) {
    for (let h = minHour; h <= maxHour; h++) {
      const key = slotKey(anchor.roomId, days[di], h);
      if (getSlot(anchor.roomId, days[di], h)) keys.push(key);
    }
  }
  return keys;
};

const onSlotMouseDown = (roomId, date, hour) => {
  dragAnchor.value = { roomId: Number(roomId), date: String(date), hour: Number(hour) };
  draggingSelection.value = true;
  selectedSlotKeys.value = [slotKey(roomId, date, hour)];
};

const onSlotMouseEnter = (roomId, date, hour) => {
  if (!draggingSelection.value || !dragAnchor.value) return;
  selectedSlotKeys.value = dragSelectionKeys(dragAnchor.value, {
    roomId: Number(roomId),
    date: String(date),
    hour: Number(hour)
  });
};

const onGlobalMouseUp = () => {
  if (!draggingSelection.value) return;
  suppressNextClick.value = (selectedSlotKeys.value || []).length > 1;
  draggingSelection.value = false;
  dragAnchor.value = null;
};

const weekdayFromYmd = (ymd) => {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCDay();
};

const toggleAssignWeekday = (value) => {
  const v = Number(value);
  if (!Number.isInteger(v) || v < 0 || v > 6) return;
  const set = new Set(assignWeekdays.value || []);
  if (set.has(v)) set.delete(v);
  else set.add(v);
  assignWeekdays.value = Array.from(set.values()).sort((a, b) => a - b);
};

const toggleBulkAssignWeekday = (value) => {
  const v = Number(value);
  if (!Number.isInteger(v) || v < 0 || v > 6) return;
  const set = new Set(bulkAssignWeekdays.value || []);
  if (set.has(v)) set.delete(v);
  else set.add(v);
  bulkAssignWeekdays.value = Array.from(set.values()).sort((a, b) => a - b);
};

const bulkAssignSelected = async () => {
  if (!officeId.value || !bulkCanAssign.value) return;
  const slots = selectedOpenSlots.value.slice();
  let okCount = 0;
  try {
    saving.value = true;
    error.value = '';
    for (const s of slots) {
      // eslint-disable-next-line no-await-in-loop
      await api.post(`/office-slots/${officeId.value}/open-slots/assign`, {
        roomId: s.roomId,
        date: s.date,
        hour: s.hour,
        endHour: Number(s.hour) + 1,
        assignedUserId: bulkProviderId.value,
        recurrenceFrequency: bulkAssignRecurrenceFreq.value,
        recurringUntilDate: bulkAssignRecurrenceFreq.value === 'ONCE' ? null : bulkAssignUntilDate.value,
        weekdays: bulkAssignRecurrenceFreq.value === 'ONCE' ? [] : bulkAssignWeekdays.value
      });
      okCount += 1;
    }
    setSuccessToast(`Assigned ${okCount} slot${okCount === 1 ? '' : 's'}.`);
    await loadGrid();
    clearSelection();
  } catch (e) {
    error.value = e.response?.data?.error?.message || `Assigned ${okCount} slots before an error occurred.`;
  } finally {
    saving.value = false;
  }
};

const bulkDeleteSelected = async () => {
  if (!officeId.value || !selectedAssignedSlots.value.length) return;
  const ok = window.confirm(`Delete ${selectedAssignedSlots.value.length} selected assigned slot(s)?`);
  if (!ok) return;
  let okCount = 0;
  try {
    saving.value = true;
    error.value = '';
    for (const s of selectedAssignedSlots.value) {
      if (s.eventId) {
        // eslint-disable-next-line no-await-in-loop
        await api.post(`/office-slots/${officeId.value}/events/${s.eventId}/cancel`, { scope: 'occurrence' });
      } else if (s.standingAssignmentId) {
        // eslint-disable-next-line no-await-in-loop
        await api.post(`/office-slots/${officeId.value}/assignments/${s.standingAssignmentId}/cancel`, {
          scope: 'occurrence',
          date: s.date,
          hour: s.hour
        });
      }
      okCount += 1;
    }
    setSuccessToast(`Deleted ${okCount} slot${okCount === 1 ? '' : 's'}.`);
    await loadGrid();
    clearSelection();
  } catch (e) {
    error.value = e.response?.data?.error?.message || `Deleted ${okCount} slots before an error occurred.`;
  } finally {
    saving.value = false;
  }
};

const bulkEditRecurrenceSelected = async () => {
  if (!officeId.value || !selectedAssignedSlots.value.length) return;
  const uniqueTargets = new Map();
  for (const s of selectedAssignedSlots.value) {
    if (s.eventId) uniqueTargets.set(`e:${s.eventId}`, { type: 'event', id: s.eventId, date: s.date });
    else if (s.standingAssignmentId) uniqueTargets.set(`a:${s.standingAssignmentId}`, { type: 'assignment', id: s.standingAssignmentId, date: s.date });
  }
  let okCount = 0;
  try {
    saving.value = true;
    error.value = '';
    for (const t of uniqueTargets.values()) {
      if (t.type === 'event') {
        // eslint-disable-next-line no-await-in-loop
        await api.post(`/office-slots/${officeId.value}/events/${t.id}/recurrence`, {
          recurrenceFrequency: bulkEditRecurrenceFreq.value,
          recurringUntilDate: bulkEditRecurrenceUntil.value || addDaysYmd(t.date, 364)
        });
      } else {
        // eslint-disable-next-line no-await-in-loop
        await api.post(`/office-slots/${officeId.value}/assignments/${t.id}/recurrence`, {
          recurrenceFrequency: bulkEditRecurrenceFreq.value,
          recurringUntilDate: bulkEditRecurrenceUntil.value || addDaysYmd(t.date, 364)
        });
      }
      okCount += 1;
    }
    setSuccessToast(`Updated recurrence on ${okCount} slot target${okCount === 1 ? '' : 's'}.`);
    await loadGrid();
    clearSelection();
  } catch (e) {
    error.value = e.response?.data?.error?.message || `Updated ${okCount} targets before an error occurred.`;
  } finally {
    saving.value = false;
  }
};

const canSelfManageModalSlot = computed(() => {
  if (canManageSchedule.value) return true;
  const s = modalSlot.value;
  if (!s) return false;
  const providerId = Number(modalSlot.value?.providerId || 0);
  if (providerId > 0) return providerId === currentUserId.value;

  // Fallback for data edge-cases where assigned/booked owner ids are missing on the
  // slot payload: allow self-service path and let backend enforce true ownership.
  const state = String(s?.state || '');
  const isAssignedState = state === 'assigned_available' || state === 'assigned_temporary' || state === 'assigned_booked';
  return isAssignedState && Boolean(s?.standingAssignmentId || s?.eventId);
});

const isRecurringSlot = computed(() => {
  const s = modalSlot.value;
  if (!s) return false;
  if (s.standingAssignmentId) return true;
  const f = String(s.frequency || '').toUpperCase();
  return f === 'WEEKLY' || f === 'BIWEEKLY' || f === 'MONTHLY';
});

const isAssignedUnbooked = computed(() => {
  const s = String(modalSlot.value?.state || '');
  return s === 'assigned_available' || s === 'assigned_temporary';
});
const isModalBooked = computed(() => String(modalSlot.value?.state || '') === 'assigned_booked');
const modalVirtualIntakeEnabled = computed(() => Boolean(modalSlot.value?.virtualIntakeEnabled));
const modalInPersonIntakeEnabled = computed(() => Boolean(modalSlot.value?.inPersonIntakeEnabled));
const canToggleVirtualIntake = computed(() => canSelfManageModalSlot.value && Boolean(modalSlot.value?.eventId));
const canToggleInPersonIntake = computed(() => canSelfManageModalSlot.value && Boolean(modalSlot.value?.eventId));
const canCreateLearningSession = computed(() => {
  if (saving.value || creatingLearningSession.value) return false;
  if (!canManageSchedule.value) return false;
  if (!modalSlot.value?.eventId) return false;
  if (String(modalSlot.value?.state || '') !== 'assigned_booked') return false;
  return Number(selectedLearningClientId.value || 0) > 0;
});

const refreshModalSlotFromGrid = () => {
  const s = modalSlot.value;
  if (!s) return;
  const latest = getSlot(s.roomId, s.date, s.hour);
  if (latest) modalSlot.value = { ...latest };
};

const assignOpenSlot = async () => {
  if (!officeId.value || !modalSlot.value?.roomId || !selectedProviderId.value) {
    error.value = assignDisabledReason.value || 'Select provider/slot before assigning.';
    return;
  }
  if (assignRecurrenceFreq.value !== 'ONCE' && (!Array.isArray(assignWeekdays.value) || !assignWeekdays.value.length)) {
    error.value = 'Select at least one weekday for recurring assignment.';
    return;
  }
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/office-slots/${officeId.value}/open-slots/assign`, {
      roomId: modalSlot.value.roomId,
      date: modalSlot.value.date,
      hour: modalSlot.value.hour,
      endHour: assignEndHour.value,
      assignedUserId: selectedProviderId.value,
      recurrenceFrequency: assignRecurrenceFreq.value,
      recurringUntilDate: assignRecurrenceFreq.value === 'ONCE' ? null : assignRecurringUntilDate.value,
        weekdays: assignRecurrenceFreq.value === 'ONCE' ? [] : assignWeekdays.value,
        temporaryWeeks: assignTemporary4Weeks.value && assignRecurrenceFreq.value !== 'ONCE' ? 4 : 0
    });
    setSuccessToast('Slot assigned successfully.');
    await loadGrid();
    closeModal();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to assign slot';
  } finally {
    saving.value = false;
  }
};

const bookSlot = async () => {
  if (!officeId.value) return;
  try {
    saving.value = true;
    if (modalSlot.value?.standingAssignmentId) {
      await api.post(`/office-slots/${officeId.value}/assignments/${modalSlot.value.standingAssignmentId}/booking-plan`, {
        bookedFrequency: bookFreq.value,
        bookedOccurrenceCount: Number(bookOccurrenceCount.value || 6),
        bookingStartDate: modalSlot.value.date,
        recurringUntilDate: addDaysYmd(modalSlot.value.date, 364)
      });
    } else if (modalSlot.value?.eventId) {
      await api.post(`/office-slots/${officeId.value}/events/${modalSlot.value.eventId}/booking-plan`, {
        bookedFrequency: bookFreq.value,
        bookedOccurrenceCount: Number(bookOccurrenceCount.value || 6),
        bookingStartDate: modalSlot.value.date,
        recurringUntilDate: addDaysYmd(modalSlot.value.date, 364)
      });
    } else {
      return;
    }
    setSuccessToast('Booking plan saved.');
    await loadGrid();
    closeModal();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to set booking plan';
  } finally {
    saving.value = false;
  }
};

const saveRecurrence = async () => {
  if (!officeId.value || !editRecurrenceFreq.value) return;
  try {
    saving.value = true;
    if (modalSlot.value?.standingAssignmentId) {
      await api.post(`/office-slots/${officeId.value}/assignments/${modalSlot.value.standingAssignmentId}/recurrence`, {
        recurrenceFrequency: editRecurrenceFreq.value,
        recurringUntilDate: editRecurrenceUntil.value || addDaysYmd(modalSlot.value.date, 364)
      });
    } else if (modalSlot.value?.eventId) {
      await api.post(`/office-slots/${officeId.value}/events/${modalSlot.value.eventId}/recurrence`, {
        recurrenceFrequency: editRecurrenceFreq.value,
        recurringUntilDate: editRecurrenceUntil.value || addDaysYmd(modalSlot.value.date, 364)
      });
    } else {
      return;
    }
    setSuccessToast('Recurrence saved.');
    await loadGrid();
    closeModal();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save recurrence';
  } finally {
    saving.value = false;
  }
};

const keepAvailable = async () => {
  if (!officeId.value || !modalSlot.value?.standingAssignmentId) return;
  try {
    saving.value = true;
    await api.post(`/office-slots/${officeId.value}/assignments/${modalSlot.value.standingAssignmentId}/keep-available`, {
      acknowledged: true
    });
    setSuccessToast('Assigned slot confirmed.');
    await loadGrid();
    closeModal();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to keep available';
  } finally {
    saving.value = false;
  }
};

const setTemporary = async () => {
  if (!officeId.value || !modalSlot.value?.standingAssignmentId) return;
  try {
    saving.value = true;
    await api.post(`/office-slots/${officeId.value}/assignments/${modalSlot.value.standingAssignmentId}/temporary`, { weeks: 4 });
    setSuccessToast('Temporary mode set for this assignment.');
    await loadGrid();
    closeModal();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to set temporary';
  } finally {
    saving.value = false;
  }
};

const forfeit = async () => {
  if (!officeId.value) return;
  const scope = forfeitScope.value === 'future' && isRecurringSlot.value ? 'future' : 'occurrence';
  try {
    saving.value = true;
    if (modalSlot.value?.eventId) {
      await api.post(`/office-slots/${officeId.value}/events/${modalSlot.value.eventId}/forfeit`, {
        acknowledged: true,
        scope
      });
    } else if (modalSlot.value?.standingAssignmentId) {
      if (scope !== 'future') {
        throw new Error('This slot only supports future-scope forfeit');
      }
      await api.post(`/office-slots/${officeId.value}/assignments/${modalSlot.value.standingAssignmentId}/forfeit`, {
        acknowledged: true,
        scope: 'future'
      });
    } else {
      return;
    }
    setSuccessToast('Slot forfeited.');
    await loadGrid();
    closeModal();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to forfeit';
  } finally {
    saving.value = false;
  }
};

const staffBook = async (booked = true) => {
  if (!officeId.value || !modalSlot.value?.eventId) return;
  try {
    saving.value = true;
    await api.post(`/office-slots/${officeId.value}/events/${modalSlot.value.eventId}/book`, {
      booked
    });
    setSuccessToast(booked ? 'Occurrence marked booked.' : 'Occurrence marked unbooked.');
    await loadGrid();
    closeModal();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update booked status';
  } finally {
    saving.value = false;
  }
};

const enableVirtualIntake = async () => {
  if (!officeId.value || !modalSlot.value?.eventId) return;
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/office-slots/${officeId.value}/events/${modalSlot.value.eventId}/virtual-intake`, {
      enabled: true,
      agencyId: currentAgencyId.value
    });
    setSuccessToast('Virtual intake enabled for this slot.');
    await loadGrid();
    refreshModalSlotFromGrid();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to enable virtual intake';
  } finally {
    saving.value = false;
  }
};

const enableInPersonIntake = async () => {
  if (!officeId.value || !modalSlot.value?.eventId) return;
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/office-slots/${officeId.value}/events/${modalSlot.value.eventId}/in-person-intake`, {
      enabled: true,
      agencyId: currentAgencyId.value
    });
    setSuccessToast('In-person intake enabled for this slot.');
    await loadGrid();
    refreshModalSlotFromGrid();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to enable in-person intake';
  } finally {
    saving.value = false;
  }
};

const disableInPersonIntake = async () => {
  if (!officeId.value || !modalSlot.value?.eventId) return;
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/office-slots/${officeId.value}/events/${modalSlot.value.eventId}/in-person-intake`, {
      enabled: false,
      agencyId: currentAgencyId.value
    });
    setSuccessToast('In-person intake disabled for this slot.');
    await loadGrid();
    refreshModalSlotFromGrid();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to disable in-person intake';
  } finally {
    saving.value = false;
  }
};

const disableVirtualIntake = async () => {
  if (!officeId.value || !modalSlot.value?.eventId) return;
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/office-slots/${officeId.value}/events/${modalSlot.value.eventId}/virtual-intake`, {
      enabled: false,
      agencyId: currentAgencyId.value
    });
    setSuccessToast('Virtual intake disabled for this slot.');
    await loadGrid();
    refreshModalSlotFromGrid();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to disable virtual intake';
  } finally {
    saving.value = false;
  }
};

const createLearningSessionFromModal = async () => {
  const aid = Number(currentAgencyId.value || 0);
  const eventId = Number(modalSlot.value?.eventId || 0);
  const clientId = Number(selectedLearningClientId.value || 0);
  if (!aid || !eventId || !clientId) return;
  try {
    creatingLearningSession.value = true;
    error.value = '';
    const payload = {
      agencyId: aid,
      officeEventId: eventId,
      clientId,
      paymentMode: String(learningPaymentMode.value || 'PAY_PER_EVENT').toUpperCase()
    };
    const serviceId = Number(selectedLearningServiceId.value || 0);
    if (serviceId > 0) payload.learningServiceId = serviceId;
    payload.sourceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Denver';
    const resp = await api.post('/learning-billing/sessions/from-office-event', payload);
    const covered = Boolean(resp?.data?.coverage?.covered);
    const mode = String(resp?.data?.coverage?.mode || payload.paymentMode).toUpperCase();
    if (covered && mode === 'TOKEN') {
      setSuccessToast('Learning session linked and covered by token.');
    } else if (covered && mode === 'SUBSCRIPTION') {
      setSuccessToast('Learning session linked and covered by active subscription.');
    } else {
      setSuccessToast('Learning session linked and pending charge created.');
    }
    await loadGrid();
    await loadModalSlotFromGrid();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to create linked learning session';
  } finally {
    creatingLearningSession.value = false;
  }
};

const cancelEventAction = async () => {
  if (!officeId.value || !modalSlot.value?.eventId) return;
  const selected = String(cancelScope.value || 'occurrence');
  let scope = 'occurrence';
  let applyToSet = false;
  if (selected === 'future_day') {
    scope = 'future';
    applyToSet = false;
  } else if (selected === 'week') {
    scope = 'week';
    applyToSet = true;
  } else if (selected === 'future_set') {
    scope = 'future';
    applyToSet = true;
  } else if (selected === 'until') {
    scope = 'until';
    applyToSet = true;
  }
  const prompt =
    selected === 'future_set'
      ? 'Cancel this recurring set from today forward?'
      : selected === 'future_day'
        ? 'Cancel this day of week from today forward (leave other days in the set)?'
        : selected === 'week'
          ? 'Cancel this recurring set for this week only?'
          : selected === 'until'
            ? `Cancel this recurring set until ${cancelUntilDate.value || 'the selected date'}?`
            : 'Delete this occurrence from schedule?';
  const ok = window.confirm(prompt);
  if (!ok) return;
  try {
    saving.value = true;
    if (modalSlot.value?.eventId) {
      await api.post(`/office-slots/${officeId.value}/events/${modalSlot.value.eventId}/cancel`, {
        scope,
        applyToSet,
        untilDate: selected === 'until' ? cancelUntilDate.value : null
      });
    } else {
      await api.post(`/office-slots/${officeId.value}/assignments/${modalSlot.value.standingAssignmentId}/cancel`, {
        scope,
        applyToSet,
        date: modalSlot.value.date,
        hour: modalSlot.value.hour,
        untilDate: selected === 'until' ? cancelUntilDate.value : null
      });
    }
    setSuccessToast('Schedule update saved.');
    await loadGrid();
    closeModal();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to delete event';
  } finally {
    saving.value = false;
  }
};

const purgeFutureBookedSlot = async () => {
  const targetOfficeId = Number(officeId.value || modalSlot.value?.officeLocationId || 0);
  const targetEventId = Number(modalSlot.value?.eventId || 0);
  if (!targetOfficeId || !targetEventId) {
    error.value = 'Unable to purge: slot is missing office/event linkage.';
    return;
  }
  const ok = window.confirm('Purge future booked occurrences for this provider + room + day/time slot? This is superadmin-only cleanup.');
  if (!ok) return;
  try {
    purgingFuture.value = true;
    const resp = await api.post(`/office-slots/${targetOfficeId}/events/${targetEventId}/purge-future-slot`, {});
    const count = Number(resp?.data?.purgedEventCount || 0);
    setSuccessToast(count > 0
      ? `Purged ${count} future booked occurrence${count === 1 ? '' : 's'} for this provider + slot.`
      : 'No future booked occurrences matched this provider + slot.');
    await loadGrid();
    closeModal();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to purge future booked occurrences';
  } finally {
    purgingFuture.value = false;
  }
};

watch(() => officeId.value, async () => {
  grid.value = null;
  await loadGrid();
  if (canManageSchedule.value) await loadProviders();
}, { immediate: true });

onMounted(loadGrid);
onMounted(() => {
  if (canManageSchedule.value) void loadProviders();
  window.addEventListener('mouseup', onGlobalMouseUp);
});
onBeforeUnmount(() => {
  if (successToastTimer) clearTimeout(successToastTimer);
  if (bulkActionsDelayTimer) clearTimeout(bulkActionsDelayTimer);
  window.removeEventListener('mouseup', onGlobalMouseUp);
});

watch(
  [() => selectedSlots.value.length, draggingSelection, showModal],
  ([count, dragging, modalOpen]) => {
    if (modalOpen || count <= 1) {
      bulkActionsVisible.value = false;
      bulkActionsExpanded.value = false;
      if (bulkActionsDelayTimer) {
        clearTimeout(bulkActionsDelayTimer);
        bulkActionsDelayTimer = null;
      }
      return;
    }
    if (dragging) {
      bulkActionsExpanded.value = false;
      if (bulkActionsDelayTimer) {
        clearTimeout(bulkActionsDelayTimer);
        bulkActionsDelayTimer = null;
      }
      return;
    }
    // Small delay so the tray does not instantly cover click targets while selecting.
    if (bulkActionsDelayTimer) clearTimeout(bulkActionsDelayTimer);
    bulkActionsDelayTimer = setTimeout(() => {
      bulkActionsVisible.value = true;
      // Open minimized by default to keep selection flow uninterrupted.
      bulkActionsExpanded.value = false;
      bulkActionsDelayTimer = null;
    }, 500);
  },
  { immediate: true }
);
</script>

<style scoped>
.office-schedule {
  --sched-bg-0: #f4f7fb;
  --sched-bg-1: #eef3f9;
  --sched-surface: rgba(255, 255, 255, 0.7);
  --sched-surface-strong: rgba(255, 255, 255, 0.84);
  --sched-border: rgba(148, 163, 184, 0.34);
  --sched-border-strong: rgba(100, 116, 139, 0.42);
  --sched-text: #0f172a;
  --sched-text-muted: #475569;
  --sched-accent: #2563eb;
  --sched-shadow-soft: 0 10px 30px rgba(15, 23, 42, 0.08);
  --sched-shadow-strong: 0 22px 60px rgba(15, 23, 42, 0.16);
  background:
    radial-gradient(circle at 10% -10%, rgba(37, 99, 235, 0.08), transparent 38%),
    radial-gradient(circle at 90% -20%, rgba(20, 184, 166, 0.09), transparent 34%),
    linear-gradient(180deg, var(--sched-bg-0), var(--sched-bg-1));
  border-radius: 14px;
  padding: 14px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 14px;
  margin-bottom: 12px;
  padding: 12px 14px;
  border: 1px solid var(--sched-border);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.54));
  backdrop-filter: blur(8px);
  box-shadow: var(--sched-shadow-soft);
}
.subtitle { color: var(--sched-text-muted); margin-top: 4px; font-size: 13px; }
.controls { display: flex; align-items: end; gap: 10px; flex-wrap: wrap; }
.btn-group {
  display: inline-flex;
  gap: 0;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}
.btn-group .btn {
  border-radius: 0;
  border-right-width: 0;
}
.btn-group .btn:last-child { border-right-width: 1px; border-radius: 0 10px 10px 0; }
.btn-group .btn:first-child { border-radius: 10px 0 0 10px; }
.field { display: flex; flex-direction: column; gap: 6px; }
input[type='date'] {
  padding: 10px 12px;
  border: 1px solid var(--sched-border);
  border-radius: 10px;
  background: var(--sched-surface-strong);
  color: var(--sched-text);
}
.muted { color: var(--sched-text-muted); }
.error-box {
  background: rgba(254, 226, 226, 0.82);
  border: 1px solid rgba(252, 165, 165, 0.65);
  padding: 10px 12px;
  border-radius: 8px;
  margin: 12px 0;
  color: #7f1d1d;
}
.loading { color: var(--sched-text-muted); }
.success-toast {
  position: fixed;
  top: 16px;
  right: 18px;
  z-index: 120;
  padding: 10px 14px;
  border-radius: 10px;
  color: #14532d;
  background: rgba(220, 252, 231, 0.95);
  border: 1px solid rgba(34, 197, 94, 0.42);
  box-shadow: 0 10px 20px rgba(21, 128, 61, 0.16);
  font-weight: 700;
  font-size: 13px;
}
.legend {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin: 10px 0 12px;
  color: var(--sched-text-muted);
  font-size: 12px;
}
.legend-item {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  padding: 5px 9px;
  border: 1px solid var(--sched-border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
}
.dot { width: 9px; height: 9px; border-radius: 999px; display: inline-block; }
.dot.open { background: #94a3b8; box-shadow: 0 0 0 4px rgba(148, 163, 184, 0.16); }
.dot.assigned_available { background: #f59e0b; box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.18); }
.dot.assigned_temporary { background: #2563eb; box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.16); }
.dot.assigned_booked { background: #ef4444; box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.16); }
.dot.intake-ip { background: #f59e0b; box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.24); }
.dot.intake-v { background: #10b981; box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.2); }
.dot.own-slot { background: #7c3aed; box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.2); }
.cancelled-google-card {
  margin-bottom: 12px;
  border: 1px solid rgba(245, 158, 11, 0.42);
  border-radius: 12px;
  padding: 10px;
  background: rgba(255, 247, 237, 0.72);
}
.cancelled-google-title {
  font-weight: 900;
  color: #92400e;
  margin-bottom: 6px;
}
.cancelled-google-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cancelled-google-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid rgba(245, 158, 11, 0.28);
  border-radius: 10px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.68);
}
.cancelled-google-meta {
  font-size: 12px;
  color: #7c2d12;
}

.room-card {
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.87), rgba(255, 255, 255, 0.68));
  backdrop-filter: blur(10px);
  border: 1px solid var(--sched-border);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
  box-shadow: var(--sched-shadow-soft);
}
.room-nav {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin: 10px 0 12px;
}
.room-nav .select {
  min-width: 220px;
}
.room-toggle {
  padding: 8px 14px;
  border: 1px solid var(--sched-border-strong);
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(241, 245, 249, 0.9));
  color: var(--sched-text);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}
.room-toggle:hover:not(:disabled) {
  background: linear-gradient(180deg, rgba(241, 245, 249, 0.98), rgba(226, 232, 240, 0.95));
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.1);
}
.room-toggle-active {
  background: linear-gradient(180deg, #2563eb, #1d4ed8) !important;
  border-color: #1d4ed8 !important;
  color: #fff !important;
}
.room-toggle-active:hover:not(:disabled) {
  background: linear-gradient(180deg, #3b82f6, #2563eb) !important;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25) !important;
}

.avail-search {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--sched-border);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.62));
  backdrop-filter: blur(8px);
  box-shadow: var(--sched-shadow-soft);
}
.avail-search-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}
.avail-search-title {
  font-weight: 900;
  font-size: 14px;
}
.avail-search-form {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  align-items: end;
  margin-top: 10px;
}
@media (max-width: 900px) {
  .avail-search-form { grid-template-columns: 1fr; }
}
.avail-results {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bulk-actions {
  position: fixed;
  right: 14px;
  bottom: 14px;
  width: min(620px, calc(100vw - 28px));
  max-height: 68vh;
  overflow: auto;
  z-index: 80;
  margin: 0;
  padding: 10px;
  border: 1px solid var(--sched-border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.74);
  box-shadow: var(--sched-shadow-strong);
}
.bulk-actions-mini {
  position: fixed;
  right: 14px;
  bottom: 14px;
  z-index: 80;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--sched-border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: var(--sched-shadow-strong);
  display: flex;
  align-items: center;
  gap: 10px;
}
.bulk-mini-title {
  font-size: 13px;
  font-weight: 800;
}
.bulk-mini-actions {
  display: inline-flex;
  gap: 8px;
}
.bulk-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.bulk-head-actions {
  display: inline-flex;
  gap: 8px;
}
.bulk-title {
  font-size: 13px;
  font-weight: 800;
}
.bulk-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.bulk-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.office-schedule :deep(.person-search-select) {
  min-width: 200px;
}
.office-schedule :deep(.person-search-select .input) {
  padding: 10px 12px;
  border: 1px solid var(--sched-border-strong);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
}
@media (max-width: 900px) {
  .bulk-grid { grid-template-columns: 1fr; }
}
.avail-row {
  display: grid;
  grid-template-columns: 1fr 1.4fr auto;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--sched-border);
  border-radius: 12px;
  background: var(--sched-surface);
}
@media (max-width: 900px) {
  .avail-row { grid-template-columns: 1fr; }
}
.avail-room-title { line-height: 1.15; }
.pill {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;
  border: 1px solid rgba(15, 23, 42, 0.12);
}
.pill-open { background: rgba(16, 185, 129, 0.12); border-color: rgba(16, 185, 129, 0.25); }
.pill-assigned_available { background: rgba(59, 130, 246, 0.10); border-color: rgba(59, 130, 246, 0.22); }
.pill-assigned_temporary { background: rgba(245, 158, 11, 0.14); border-color: rgba(245, 158, 11, 0.28); }
.pill-assigned_booked { background: rgba(239, 68, 68, 0.12); border-color: rgba(239, 68, 68, 0.22); }
.room-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }

.week-table {
  display: grid;
  grid-template-columns: 90px repeat(7, minmax(0, 1fr));
  gap: 5px;
}
.cell {
  border: 1px solid var(--sched-border);
  border-radius: 8px;
  padding: 6px;
  background: rgba(255, 255, 255, 0.74);
  font-size: 12px;
  color: var(--sched-text-muted);
}
.corner { background: transparent; border: none; }
.day-head {
  background: rgba(255, 255, 255, 0.94);
  font-weight: 800;
  color: var(--sched-text);
  text-align: center;
  box-shadow: inset 0 0 0 1px rgba(226, 232, 240, 0.6);
}
.day-head.today {
  box-shadow:
    inset 0 0 0 1px rgba(37, 99, 235, 0.32),
    0 0 0 2px rgba(37, 99, 235, 0.16);
}
.hour-head {
  background: rgba(255, 255, 255, 0.9);
  font-weight: 700;
  color: var(--sched-text);
  box-shadow: inset 0 0 0 1px rgba(226, 232, 240, 0.55);
}
.slot {
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(10px) saturate(135%);
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.74), rgba(255, 255, 255, 0.5));
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-radius: 10px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.72),
    0 3px 10px rgba(15, 23, 42, 0.08);
  transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease;
}
.slot::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.48), rgba(255, 255, 255, 0.03));
  pointer-events: none;
}
.slot::after {
  content: '';
  position: absolute;
  left: 10%;
  top: -80%;
  width: 55%;
  height: 220%;
  transform: rotate(18deg);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.24), rgba(255, 255, 255, 0));
  opacity: 0.55;
  pointer-events: none;
}
.slot:hover {
  box-shadow:
    inset 0 0 0 1px rgba(30, 64, 175, 0.18),
    0 10px 20px rgba(37, 99, 235, 0.16);
  transform: translateY(-1px);
}
.slot.open {
  background: linear-gradient(160deg, rgba(248, 250, 252, 0.88), rgba(241, 245, 249, 0.6));
  border-color: rgba(148, 163, 184, 0.4);
}
.slot.assigned_available {
  background: linear-gradient(165deg, rgba(255, 247, 220, 0.92), rgba(253, 230, 138, 0.44));
  border-color: rgba(245, 158, 11, 0.5);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.76),
    0 4px 12px rgba(245, 158, 11, 0.18);
}
.slot.assigned_temporary {
  background: linear-gradient(165deg, rgba(220, 234, 255, 0.9), rgba(147, 197, 253, 0.46));
  border-color: rgba(37, 99, 235, 0.5);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.72),
    0 4px 12px rgba(37, 99, 235, 0.2);
}
.slot.assigned_booked {
  background: linear-gradient(165deg, rgba(255, 226, 226, 0.9), rgba(252, 165, 165, 0.44));
  border-color: rgba(239, 68, 68, 0.5);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.72),
    0 4px 12px rgba(239, 68, 68, 0.18);
}
.slot.selected {
  outline: 2px solid rgba(37, 99, 235, 0.9);
  outline-offset: -2px;
  box-shadow:
    inset 0 0 0 1px rgba(37, 99, 235, 0.22),
    0 0 0 2px rgba(37, 99, 235, 0.15),
    0 8px 16px rgba(37, 99, 235, 0.18);
}
.slot.own-provider {
  border-color: rgba(124, 58, 237, 0.65);
  box-shadow:
    inset 0 0 0 1px rgba(124, 58, 237, 0.22),
    0 0 0 2px rgba(124, 58, 237, 0.18),
    0 8px 18px rgba(124, 58, 237, 0.2);
}
.slot.today {
  box-shadow:
    inset 0 0 0 1px rgba(37, 99, 235, 0.26),
    0 0 0 2px rgba(37, 99, 235, 0.12),
    0 8px 18px rgba(59, 130, 246, 0.16);
}
.slot-label {
  position: relative;
  z-index: 1;
  font-weight: 700;
  font-size: 11px;
  line-height: 1.1;
  color: #0b1220;
  letter-spacing: 0.01em;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.45);
  display: block;
  width: 100%;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 22px;
}
.vi-pill {
  position: absolute;
  right: 4px;
  top: 3px;
  z-index: 2;
  min-width: 18px;
  height: 14px;
  padding: 0 4px;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.78);
  color: #fff;
  font-size: 9px;
  line-height: 14px;
  font-weight: 900;
  text-align: center;
  border: 1px solid rgba(5, 150, 105, 0.6);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.16);
}
.lp-pill {
  position: absolute;
  left: 4px;
  top: 3px;
  z-index: 2;
  min-width: 18px;
  height: 14px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.02em;
  color: #1d4ed8;
  background: rgba(219, 234, 254, 0.95);
  border: 1px solid rgba(147, 197, 253, 0.95);
}
.ip-pill {
  position: absolute;
  left: 4px;
  top: 3px;
  z-index: 2;
  min-width: 18px;
  height: 14px;
  padding: 0 4px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.8);
  color: #111827;
  font-size: 9px;
  line-height: 14px;
  font-weight: 900;
  text-align: center;
  border: 1px solid rgba(217, 119, 6, 0.62);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.16);
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(9, 14, 25, 0.3);
  backdrop-filter: blur(10px) saturate(120%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 50;
}
.modal {
  width: 680px;
  max-width: 100%;
  max-height: 88vh;
  overflow: auto;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.88));
  border: 1px solid var(--sched-border-strong);
  border-radius: 14px;
  padding: 16px;
  box-shadow: var(--sched-shadow-strong);
}
.section {
  border-top: 1px solid rgba(148, 163, 184, 0.3);
  padding-top: 10px;
  margin-top: 10px;
}
.section-title { font-weight: 800; margin-bottom: 8px; }
.weekday-picker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 6px 8px;
  border: 1px solid var(--sched-border);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.6);
}
.weekday-label {
  font-size: 12px;
  color: var(--sched-text-muted);
  font-weight: 700;
  margin-right: 4px;
}
.weekday-check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--sched-text-muted);
}
.recurrence-summary {
  margin-bottom: 8px;
  padding: 8px 10px;
  border: 1px solid var(--sched-border);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.65);
  color: var(--sched-text-muted);
  font-size: 12px;
  line-height: 1.35;
}
.slot-details {
  margin-bottom: 10px;
  padding: 10px;
  border: 1px solid var(--sched-border);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--sched-text-muted);
  font-size: 12px;
  line-height: 1.35;
  display: grid;
  gap: 4px;
}
.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  margin-bottom: 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
}
.status-assigned {
  background: rgba(245, 158, 11, 0.14);
  border: 1px solid rgba(245, 158, 11, 0.35);
  color: #7c2d12;
}
.status-booked {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #7f1d1d;
}
.actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
select {
  padding: 10px 12px;
  border: 1px solid var(--sched-border-strong);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  color: var(--sched-text);
}
.check { display: inline-flex; gap: 10px; align-items: flex-start; }
.check span { color: var(--sched-text-muted); font-size: 13px; line-height: 1.35; }
.modal .row {
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.modal .btn {
  width: auto !important;
  min-width: 180px;
  border-radius: 10px;
  padding: 9px 15px;
}

.office-schedule :deep(.btn) {
  border-radius: 10px;
  font-weight: 700;
  transition: transform 140ms ease, box-shadow 140ms ease, background-color 140ms ease;
}
.office-schedule :deep(.btn:hover:not(:disabled)) {
  transform: translateY(-1px);
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.14);
}
.office-schedule :deep(.btn-primary) {
  background: linear-gradient(180deg, #2563eb, #1d4ed8);
  border-color: #1d4ed8;
}
.office-schedule :deep(.btn-secondary) {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(241, 245, 249, 0.9));
  border-color: var(--sched-border-strong);
  color: #0f172a;
}
.office-schedule :deep(.btn-danger) {
  background: linear-gradient(180deg, #ef4444, #dc2626);
  border-color: #dc2626;
}
</style>

