import pool from '../config/database.js';

/**
 * Soft-hold helpers for pending office availability requests.
 * A PENDING request with a specific room soft-holds that room+weekday+hour
 * so a second provider cannot request the same slot ("already requested").
 */

function parseJsonSafely(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

/**
 * Find an existing PENDING request that soft-holds any of the given slots.
 * @param {{ officeIds: number[], slots: Array<{ weekday: number, startHour: number, endHour: number, roomId: number|null }>, excludeRequestId?: number|null }}
 * @returns {Promise<{ requestId: number, providerId: number, weekday: number, startHour: number, endHour: number, roomId: number|null }|null>}
 */
export async function findConflictingPendingOfficeRequest({ officeIds, slots, excludeRequestId = null }) {
  const offices = (officeIds || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  const normalized = (slots || [])
    .map((s) => ({
      weekday: Number(s.weekday),
      startHour: Number(s.startHour),
      endHour: Number(s.endHour),
      roomId: Number(s.roomId || 0) || null
    }))
    .filter((s) =>
      s.weekday >= 0 && s.weekday <= 6
      && Number.isFinite(s.startHour) && Number.isFinite(s.endHour)
      && s.endHour > s.startHour
      && s.roomId // soft-hold only applies when a specific room is requested
    );
  if (!normalized.length) return null;

  // Load pending requests that could touch these offices (or have no office preference = all).
  const [reqRows] = await pool.execute(
    `SELECT r.id, r.provider_id, r.preferred_office_ids_json
     FROM provider_office_availability_requests r
     WHERE r.status = 'PENDING'
       ${excludeRequestId ? 'AND r.id <> ?' : ''}`,
    excludeRequestId ? [Number(excludeRequestId)] : []
  );

  for (const req of reqRows || []) {
    const prefIds = parseJsonSafely(req.preferred_office_ids_json);
    const prefList = Array.isArray(prefIds)
      ? prefIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    const officeOverlap =
      offices.length === 0
      || prefList.length === 0
      || offices.some((id) => prefList.includes(id));
    if (!officeOverlap) continue;

    const [slotRows] = await pool.execute(
      `SELECT weekday, start_hour, end_hour, room_id
       FROM provider_office_availability_request_slots
       WHERE request_id = ?`,
      [req.id]
    );
    for (const row of slotRows || []) {
      const existingRoomId = Number(row.room_id || 0) || null;
      if (!existingRoomId) continue; // room-agnostic pending requests do not exclusive-hold
      const eWd = Number(row.weekday);
      const eSh = Number(row.start_hour);
      const eEh = Number(row.end_hour);
      if (!(eWd >= 0 && eWd <= 6) || !(eEh > eSh)) continue;

      for (const s of normalized) {
        if (Number(s.roomId) !== Number(existingRoomId)) continue;
        if (Number(s.weekday) !== eWd) continue;
        // Hour ranges overlap: [start, end)
        if (s.startHour < eEh && s.endHour > eSh) {
          return {
            requestId: Number(req.id),
            providerId: Number(req.provider_id),
            weekday: eWd,
            startHour: eSh,
            endHour: eEh,
            roomId: existingRoomId
          };
        }
      }
    }
  }
  return null;
}

/**
 * True if a concrete room+time window is soft-held by a PENDING office request.
 * Used by same-day kiosk / isRoomOpenAt.
 */
export async function hasPendingSoftHoldAt({
  officeLocationId,
  roomId,
  weekdayIndex,
  startHour,
  endHour
}) {
  const officeId = Number(officeLocationId || 0);
  const rid = Number(roomId || 0);
  const wd = Number(weekdayIndex);
  const sh = Number(startHour);
  const eh = Number(endHour);
  if (!officeId || !rid || !(wd >= 0 && wd <= 6) || !(eh > sh)) return false;

  const [rows] = await pool.execute(
    `SELECT r.id, r.preferred_office_ids_json
     FROM provider_office_availability_requests r
     JOIN provider_office_availability_request_slots s ON s.request_id = r.id
     WHERE r.status = 'PENDING'
       AND s.room_id = ?
       AND s.weekday = ?
       AND s.start_hour < ?
       AND s.end_hour > ?`,
    [rid, wd, eh, sh]
  );

  for (const row of rows || []) {
    const prefIds = parseJsonSafely(row.preferred_office_ids_json);
    const prefList = Array.isArray(prefIds)
      ? prefIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    if (prefList.length === 0 || prefList.includes(officeId)) return true;
  }
  return false;
}

export default {
  findConflictingPendingOfficeRequest,
  hasPendingSoftHoldAt
};
