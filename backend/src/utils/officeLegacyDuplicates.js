import { parseUtcDate, mysqlDateTimeForDateHour } from './officeEventDateTime.util.js';

/** Identify old wall-clock-as-UTC availability copies only when their correctly
 * converted counterpart exists for the same assignment. Never infer this for
 * booked/client sessions or a lone off-pattern event.
 */
export function legacyOfficeAvailabilityDuplicates(events, assignments, timeZone) {
  const result = [];
  for (const event of events) {
    if (String(event.status).toUpperCase() !== 'RELEASED' || String(event.slot_state).toUpperCase() !== 'ASSIGNED_AVAILABLE'
      || event.client_id || event.clinical_session_id || event.booked_provider_id || event.booking_plan_id) continue;
    const assignment = assignments.find(a => Number(a.id) === Number(event.standing_assignment_id));
    const start = parseUtcDate(event.start_at), end = parseUtcDate(event.end_at);
    if (!assignment || !start || !end || start.getUTCDay() !== Number(assignment.weekday)
      || start.getUTCHours() !== Number(assignment.hour) || start.getUTCMinutes() || end - start !== 3600000) continue;
    const canonical = parseUtcDate(mysqlDateTimeForDateHour(start.toISOString().slice(0, 10), Number(assignment.hour), timeZone));
    if (!canonical || +canonical === +start) continue;
    if (events.some(other => Number(other.id) !== Number(event.id)
      && Number(other.standing_assignment_id) === Number(event.standing_assignment_id)
      && +parseUtcDate(other.start_at) === +canonical && +parseUtcDate(other.end_at) === +canonical + 3600000
      && !['CANCELLED', 'CANCELED'].includes(String(other.status).toUpperCase()))) result.push(Number(event.id));
  }
  return result;
}
