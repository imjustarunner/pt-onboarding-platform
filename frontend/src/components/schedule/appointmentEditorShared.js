/** Shared helpers for the unified appointment editor. */

export {
  expandRecurrenceDates,
  RECURRENCE_OPTIONS,
  RECURRING_FREQUENCIES,
  ALL_RECURRENCE_FREQUENCIES,
  isRecurringFrequency,
  normalizeRecurrenceFrequency,
  recurrenceLabel,
  occurrenceDatesSimple,
  indefiniteOccurrenceCount
} from '../../utils/scheduleRecurrence.js';

export const APPOINTMENT_EDITOR_STATUS_OPTIONS = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'draft', label: 'Draft' },
  { value: 'completed', label: 'Completed' },
  { value: 'canceled_by_provider', label: 'Canceled' },
  { value: 'no_show', label: 'No-show' },
  { value: 'BOOKED', label: 'Booked' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'TEMPORARY', label: 'Temporary' },
  { value: 'Scheduled', label: 'Scheduled' }
];

const KIND_TITLES = {
  individual_session: 'Book Session',
  group_session: 'Group Session',
  agency_meeting: 'Team Meeting',
  huddle: 'Huddle',
  supervision: 'Supervision',
  portal_intake: 'Open Slot for Booking',
  attach_open_for_booking: 'Attach Open for Booking',
  office_request_only: 'Request Office',
  office: 'Request Office',
  personal_event: 'Personal Event',
  schedule_hold: 'Schedule Hold',
  schedule_hold_all_day: 'All-day Schedule Block',
  edit_schedule_event: 'Appointment',
  edit_supervision: 'Supervision',
  pick_schedule_event: 'Schedule',
  TEAM_MEETING: 'Team Meeting',
  HUDDLE: 'Huddle',
  PERSONAL_EVENT: 'Session',
  SCHEDULE_HOLD: 'Schedule Hold',
  SCHEDULE_HOLD_ALL_DAY: 'All-day Schedule Block',
  OUTREACH_TRIP: 'Outreach Trip'
};

export function appointmentEditorTitleForKind(kind, { hideOfficeAndCalendarIntegration = false, kindLabel = '', allDay = false } = {}) {
  const k = String(kind || '').trim();
  if (kindLabel) return String(kindLabel);
  if (allDay && (k === 'SCHEDULE_HOLD' || k === 'schedule_hold')) return 'All-day Schedule Block';
  if (hideOfficeAndCalendarIntegration && k === 'agency_meeting') return 'Team Meeting';
  return KIND_TITLES[k] || (k ? k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Appointment');
}

