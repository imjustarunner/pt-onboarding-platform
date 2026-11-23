import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

/**
 * Keep the same event ID for the session and leave the unused room time with
 * its original assignee. The caller holds the room writer lock and transaction.
 */
export async function keepUnusedReservationSegments(db, event, startAt, endAt, actorUserId) {
  const start = +parseUtcDate(startAt), end = +parseUtcDate(endAt);
  const fromAt = event.start_at, toAt = event.end_at;
  const originalStart = +parseUtcDate(fromAt), originalEnd = +parseUtcDate(toAt);
  if (!(end > start && start >= originalStart && end <= originalEnd)) return false;
  if (start === originalStart && end === originalEnd) return true;

  await db.execute(`UPDATE office_events SET start_at=?,end_at=?,
    google_sync_status='PENDING',updated_at=CURRENT_TIMESTAMP,
    session_context_json=JSON_SET(COALESCE(session_context_json,JSON_OBJECT()),'$.reservationSegment',TRUE)
    WHERE id=?`, [startAt, endAt, event.id]);
  const owner = event.booked_provider_id || event.assigned_provider_id;
  // A standing assignment retains its normal cadence. A one-time reservation
  // also keeps its unoccupied edges until the provider releases them.
  for (const [from, to] of [[fromAt, startAt], [endAt, toAt]]) {
    if (!(+parseUtcDate(from) < +parseUtcDate(to))) continue;
    await db.execute(`INSERT INTO office_events
      (office_location_id,room_id,start_at,end_at,status,slot_state,standing_assignment_id,booking_plan_id,
       assigned_provider_id,source,created_by_user_id,google_sync_status,session_context_json)
      VALUES (?,?,?,?,'RELEASED','ASSIGNED_AVAILABLE',?,?,?,?, 'PENDING',JSON_OBJECT('reservationSegment',TRUE))`,
    [event.office_location_id, event.room_id, from, to, event.standing_assignment_id || null,
      event.booking_plan_id || null, owner, event.source || null, actorUserId]);
  }
  return true;
}
