import { addDaysYmd } from '../utils/scheduleRecurrence.js';

export function distinctOfficeRequestWindows(slots, startDate) {
  const baseWeekday = new Date(`${startDate}T12:00:00Z`).getUTCDay();
  const unique = new Map();
  for (const slot of slots) {
    const weekday = Number(slot.weekday);
    const startHour = Number(slot.startHour ?? slot.start_hour);
    const endHour = Number(slot.endHour ?? slot.end_hour);
    const roomId = Number(slot.roomId ?? slot.room_id) || null;
    const key = `${weekday}:${startHour}:${endHour}:${roomId}`;
    unique.set(key, { weekday, startHour, endHour, roomId,
      startDate: addDaysYmd(startDate, (weekday - baseWeekday + 7) % 7) });
  }
  return [...unique.values()];
}

// The caller owns the transaction: all selected days are saved, or none are.
export async function insertOfficeRequestWindows(db, request, windows) {
  const ids = [];
  const json = value => value == null ? null : (typeof value === 'string' ? value : JSON.stringify(value));
  for (const window of windows) {
    const [result] = await db.execute(`INSERT INTO provider_office_availability_requests
      (agency_id, provider_id, preferred_office_ids_json, preferred_rooms_json, notes,
       status, requested_frequency, requested_occurrence_count, requested_start_date)
      VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`, [
      request.agencyId, request.providerId, json(request.officesJson), json(request.roomsJson),
      request.notes || null, request.recurrence, request.occurrenceCount, window.startDate
    ]);
    ids.push(result.insertId);
    await db.execute(`INSERT INTO provider_office_availability_request_slots
      (request_id, weekday, start_hour, end_hour, room_id) VALUES (?, ?, ?, ?, ?)`,
    [result.insertId, window.weekday, window.startHour, window.endHour, window.roomId]);
  }
  return ids;
}

// Historical multi-window requests must not be resolved after approving only
// their first day. Split them under a row lock, then let staff review each day.
export async function splitPendingOfficeRequest(db, { requestId, agencyId }) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[request]] = await conn.execute(`SELECT * FROM provider_office_availability_requests
      WHERE id=? AND agency_id=? AND status='PENDING' FOR UPDATE`, [requestId, agencyId]);
    if (!request) { await conn.rollback(); return []; }
    const [slots] = await conn.execute(`SELECT weekday, start_hour, end_hour, room_id
      FROM provider_office_availability_request_slots WHERE request_id=? ORDER BY weekday, start_hour`, [requestId]);
    const startDate = request.requested_start_date instanceof Date
      ? request.requested_start_date.toISOString().slice(0, 10)
      : String(request.requested_start_date).slice(0, 10);
    const windows = distinctOfficeRequestWindows(slots, /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : new Date().toISOString().slice(0, 10));
    if (windows.length <= 1) { await conn.rollback(); return []; }
    const [first, ...remaining] = windows;
    const ids = await insertOfficeRequestWindows(conn, {
      agencyId, providerId: request.provider_id, officesJson: request.preferred_office_ids_json,
      roomsJson: request.preferred_rooms_json,
      notes: `${request.notes || ''}\nSeparated from multi-day office request #${requestId}.`.trim(),
      recurrence: request.requested_frequency, occurrenceCount: request.requested_occurrence_count
    }, remaining);
    await conn.execute('DELETE FROM provider_office_availability_request_slots WHERE request_id=?', [requestId]);
    await conn.execute(`INSERT INTO provider_office_availability_request_slots
      (request_id, weekday, start_hour, end_hour, room_id) VALUES (?, ?, ?, ?, ?)`,
    [requestId, first.weekday, first.startHour, first.endHour, first.roomId]);
    await conn.execute('UPDATE provider_office_availability_requests SET requested_start_date=? WHERE id=?', [first.startDate, requestId]);
    await conn.commit();
    return [requestId, ...ids];
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
}
