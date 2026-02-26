/**
 * Leave of absence helpers for provider display.
 * Fetches leave_type, departure_date, return_date from user_info_values.
 */
import pool from '../config/database.js';

const LEAVE_FIELD_KEYS = ['leave_type', 'leave_departure_date', 'leave_return_date'];

/**
 * Get leave of absence info for multiple user IDs.
 * Returns Map<userId, { leaveType, departureDate, returnDate, isOnLeave, leaveLabel }>.
 */
export async function getLeaveInfoForUserIds(userIds) {
  const ids = [...new Set((userIds || []).map((id) => parseInt(id, 10)).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return new Map();

  const [defRows] = await pool.execute(
    `SELECT id, field_key FROM user_info_field_definitions
     WHERE field_key IN (?, ?, ?)
     ORDER BY FIELD(field_key, 'leave_type', 'leave_departure_date', 'leave_return_date')`,
    LEAVE_FIELD_KEYS
  );
  const defIdByKey = new Map((defRows || []).map((r) => [String(r.field_key || '').trim(), Number(r.id)]));
  const defIds = LEAVE_FIELD_KEYS.map((k) => defIdByKey.get(k)).filter(Boolean);
  if (defIds.length === 0) return new Map();

  const idPlaceholders = ids.map(() => '?').join(',');
  const defPlaceholders = defIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT uiv.user_id, uiv.field_definition_id, uiv.value
     FROM user_info_values uiv
     WHERE uiv.user_id IN (${idPlaceholders}) AND uiv.field_definition_id IN (${defPlaceholders})`,
    [...ids, ...defIds]
  );

  const keyById = new Map((defRows || []).map((d) => [Number(d.id), String(d.field_key || '').trim()]));
  const byUser = new Map();
  for (const r of rows || []) {
    const uid = Number(r.user_id);
    if (!byUser.has(uid)) byUser.set(uid, { leaveType: null, departureDate: null, returnDate: null });
    const k = keyById.get(Number(r.field_definition_id));
    if (k) byUser.get(uid)[k === 'leave_type' ? 'leaveType' : k === 'leave_departure_date' ? 'departureDate' : 'returnDate'] = r.value || null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const result = new Map();
  for (const [uid, data] of byUser) {
    const dep = data.departureDate || null;
    const ret = data.returnDate || null;
    const isOnLeave = !!(dep && ret && dep <= today && ret >= today);
    const leaveType = data.leaveType || null;
    let leaveLabel = '';
    if (isOnLeave && leaveType) {
      leaveLabel = leaveType === 'maternity' ? 'Maternity leave' : leaveType === 'paternity' ? 'Paternity leave' : leaveType === 'medical' ? 'Medical leave' : 'On leave';
    } else if (isOnLeave) {
      leaveLabel = 'On leave';
    }
    result.set(uid, { leaveType, departureDate: dep, returnDate: ret, isOnLeave, leaveLabel });
  }
  return result;
}
