/** Shared helpers for the unified appointment editor. */

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
  SCHEDULE_HOLD_ALL_DAY: 'All-day Schedule Block'
};

export function appointmentEditorTitleForKind(kind, { hideOfficeAndCalendarIntegration = false, kindLabel = '', allDay = false } = {}) {
  const k = String(kind || '').trim();
  if (kindLabel) return String(kindLabel);
  if (allDay && (k === 'SCHEDULE_HOLD' || k === 'schedule_hold')) return 'All-day Schedule Block';
  if (hideOfficeAndCalendarIntegration && k === 'agency_meeting') return 'Team Meeting';
  return KIND_TITLES[k] || (k ? k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Appointment');
}

function addDaysYmd(ymd, days) {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map((n) => Number(n));
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function weekdayShortFromYmd(ymd) {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map((n) => Number(n));
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getUTCDay()];
}

/**
 * Expand a start date into occurrence dates for weekly/biweekly/monthly series.
 * Supports multi-weekday weekly series and until-date or occurrence count.
 */
export function expandRecurrenceDates({
  startYmd,
  frequency = 'ONCE',
  endMode = 'count',
  occurrenceCount = 1,
  untilDate = '',
  weekdays = []
} = {}) {
  const start = String(startYmd || '').slice(0, 10);
  if (!start) return [];
  const freq = String(frequency || 'ONCE').toUpperCase();
  if (freq === 'ONCE') return [start];

  const maxCount = Math.min(52, Math.max(1, Number(occurrenceCount || 1) || 1));
  const until = endMode === 'until' ? String(untilDate || '').slice(0, 10) : '';
  // Cap: until-date and indefinite walk weeks; count mode stops at N occurrences.
  const occurrenceCap = endMode === 'count' ? maxCount : (endMode === 'indefinite' ? 12 : 52);
  const days = Array.isArray(weekdays) && weekdays.length
    ? weekdays.map(String)
    : [weekdayShortFromYmd(start)].filter(Boolean);

  const out = [];
  if (freq === 'MONTHLY') {
    let cursor = start;
    while (out.length < occurrenceCap) {
      if (until && cursor > until) break;
      out.push(cursor);
      const [y, m, d] = cursor.split('-').map((n) => Number(n));
      const next = new Date(Date.UTC(y, m - 1 + 1, d));
      cursor = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
      if (out.length > 60) break;
    }
    return out;
  }

  const stepWeeks = freq === 'BIWEEKLY' ? 2 : 1;
  // Seed: walk forward from start across selected weekdays for enough weeks.
  let weekOffset = 0;
  while (out.length < occurrenceCap && weekOffset < 60) {
    let hitPastUntil = false;
    for (const day of days) {
      // Find the date of `day` in the week that contains start + weekOffset*7
      const base = addDaysYmd(start, weekOffset * 7);
      const baseDow = weekdayShortFromYmd(base);
      const order = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const baseIdx = order.indexOf(baseDow);
      const wantIdx = order.indexOf(day);
      if (baseIdx < 0 || wantIdx < 0) continue;
      const delta = (wantIdx - baseIdx + 7) % 7;
      const candidate = addDaysYmd(base, delta);
      if (candidate < start) continue;
      if (until && candidate > until) {
        hitPastUntil = true;
        continue;
      }
      if (!out.includes(candidate)) out.push(candidate);
      if (out.length >= occurrenceCap) break;
    }
    if (hitPastUntil && until) break;
    weekOffset += stepWeeks;
  }
  return out.sort().slice(0, occurrenceCap);
}
