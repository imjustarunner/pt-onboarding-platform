import { toDateOnlyString } from './mysqlDateTime.utils.js';
import { utcMysqlToIso } from './zonedWallTime.util.js';

/**
 * Calendar sync takes saved UTC instants. GoogleCalendarService performs the
 * conversion to the event's wall clock exactly once, including metadata edits.
 * Read each saved occurrence so a series edit retains its individual date.
 */
export function providerScheduleCalendarTiming(event, fallbackTimeZone = 'America/Denver') {
  const allDay = Number(event.all_day || 0) === 1;
  return {
    startAt: allDay ? null : utcMysqlToIso(event.start_at),
    endAt: allDay ? null : utcMysqlToIso(event.end_at),
    allDay,
    startDate: allDay ? toDateOnlyString(event.start_date) : null,
    endDate: allDay ? toDateOnlyString(event.end_date) : null,
    timeZone: String(event.event_timezone || '').trim() || fallbackTimeZone
  };
}
