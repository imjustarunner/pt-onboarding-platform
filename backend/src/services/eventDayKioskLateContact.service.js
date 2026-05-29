import pool from '../config/database.js';
import { markEventDayClientAbsentWithFreeText } from './eventDayKioskAbsent.service.js';

const VALID_METHODS = new Set(['text', 'email', 'phone']);
const VALID_PHONE_OUTCOMES = new Set(['successful', 'unsuccessful']);
const VALID_REPLY_STATUSES = new Set(['reply', 'no_reply', 'auto_reply']);
const VALID_ATTENDANCE_OUTCOMES = new Set(['attending', 'not_attending', 'pending']);
const VALID_TARGET_TYPES = new Set(['guardian', 'emergency_contact']);

function mapLateContactRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    clientId: Number(row.client_id),
    kioskDate: row.kiosk_date ? String(row.kiosk_date).slice(0, 10) : null,
    staffUserId: row.staff_user_id ? Number(row.staff_user_id) : null,
    contactTarget: {
      type: row.contact_target_type || null,
      ref: row.contact_target_ref || null,
      name: row.contact_name || null,
      relationship: row.contact_relationship || null,
      phone: row.contact_phone || null,
      email: row.contact_email || null
    },
    contactMethod: row.contact_method || null,
    phoneOutcome: row.phone_outcome || null,
    replyStatus: row.reply_status || null,
    attendanceOutcome: row.attendance_outcome || null,
    absenceReason: row.absence_reason || null,
    contactedAt: row.contacted_at || null,
    resolvedAt: row.resolved_at || null,
    updatedAt: row.updated_at || null
  };
}

export function buildClientLateContactOptions(client = {}) {
  const options = [];
  for (const g of client.guardians || []) {
    const userId = Number(g.userId || g.user_id || 0);
    if (!userId) continue;
    const name = String(g.name || '').trim();
    if (!name) continue;
    options.push({
      key: `guardian:${userId}`,
      type: 'guardian',
      ref: String(userId),
      name,
      relationship: String(g.relationship || 'Guardian').trim() || 'Guardian',
      phone: String(g.phone || g.phone_number || '').trim() || null,
      email: String(g.email || '').trim() || null
    });
  }
  const seen = new Set(options.map((o) => o.key));
  (client.emergencyContacts || []).forEach((e, idx) => {
    const name = String(e?.name || '').trim();
    if (!name) return;
    const key = `emergency:${idx}:${name.toLowerCase()}:${String(e?.phone || '').replace(/\D/g, '')}`;
    if (seen.has(key)) return;
    seen.add(key);
    options.push({
      key,
      type: 'emergency_contact',
      ref: String(idx),
      name,
      relationship: String(e.relationship || 'Emergency contact').trim() || 'Emergency contact',
      phone: String(e.phone || '').trim() || null,
      email: String(e.email || '').trim() || null
    });
  });
  return options;
}

/**
 * @param {number} eventId
 * @param {string} kioskDate
 * @returns {Promise<object[]>}
 */
export async function loadLateContactsForEventDay(eventId, kioskDate) {
  const eid = Number(eventId);
  const day = String(kioskDate || '').trim();
  if (!eid || !day) return [];
  try {
    const [rows] = await pool.execute(
      `SELECT *
       FROM event_day_kiosk_late_contacts
       WHERE company_event_id = ? AND kiosk_date = ?
       ORDER BY updated_at DESC, id DESC`,
      [eid, day]
    );
    return (rows || []).map(mapLateContactRow).filter(Boolean);
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

export async function upsertEventDayLateContact({
  eventId,
  agencyId,
  clientId,
  kioskDate,
  staffUserId = null,
  contactTarget = null,
  contactMethod = null,
  phoneOutcome = null,
  replyStatus = null,
  attendanceOutcome = null,
  absenceReason = null,
  markContacted = false,
  reopenPending = false,
  ipAddress = null
}) {
  const eid = Number(eventId);
  const aid = Number(agencyId);
  const cid = Number(clientId);
  const day = String(kioskDate || '').trim();
  if (!eid || !aid || !cid || !day) {
    return { error: { status: 400, message: 'eventId, agencyId, clientId, and kioskDate are required' } };
  }

  const [cecRows] = await pool.execute(
    `SELECT 1 AS ok
     FROM company_event_clients
     WHERE company_event_id = ? AND client_id = ?
       AND (is_active = TRUE OR is_active IS NULL)
     LIMIT 1`,
    [eid, cid]
  ).catch((err) => {
    if (err?.code === 'ER_NO_SUCH_TABLE') return [[{ ok: 1 }]];
    throw err;
  });
  if (!cecRows?.[0]?.ok) {
    return { error: { status: 403, message: 'Client is not a participant for this event' } };
  }

  let existing = null;
  try {
    const [rows] = await pool.execute(
      `SELECT *
       FROM event_day_kiosk_late_contacts
       WHERE company_event_id = ? AND client_id = ? AND kiosk_date = ?
       LIMIT 1`,
      [eid, cid, day]
    );
    existing = rows?.[0] || null;
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return { error: { status: 503, message: 'Run migration 827 for late contact tracking' } };
    }
    throw err;
  }

  if (existing?.resolved_at && existing?.attendance_outcome !== 'pending' && !reopenPending) {
    return { error: { status: 409, message: 'Late contact is already resolved for today.' } };
  }

  const nextStaffUserId = staffUserId != null
    ? Number(staffUserId)
    : (existing?.staff_user_id ? Number(existing.staff_user_id) : null);

  let targetType = existing?.contact_target_type || null;
  let targetRef = existing?.contact_target_ref || null;
  let targetName = existing?.contact_name || null;
  let targetRelationship = existing?.contact_relationship || null;
  let targetPhone = existing?.contact_phone || null;
  let targetEmail = existing?.contact_email || null;

  if (contactTarget && typeof contactTarget === 'object') {
    const type = String(contactTarget.type || '').trim();
    if (!VALID_TARGET_TYPES.has(type)) {
      return { error: { status: 400, message: 'Invalid contact target type' } };
    }
    targetType = type;
    targetRef = String(contactTarget.ref || '').trim() || null;
    targetName = String(contactTarget.name || '').trim() || null;
    targetRelationship = String(contactTarget.relationship || '').trim() || null;
    targetPhone = String(contactTarget.phone || '').trim() || null;
    targetEmail = String(contactTarget.email || '').trim() || null;
  }

  if (markContacted) {
    if (!nextStaffUserId || !targetType || !targetRef || !targetName) {
      return { error: { status: 400, message: 'Select staff and a family contact before marking contacted.' } };
    }
  }

  let nextMethod = contactMethod != null ? String(contactMethod).trim() : (existing?.contact_method || null);
  if (nextMethod && !VALID_METHODS.has(nextMethod)) {
    return { error: { status: 400, message: 'Invalid contact method' } };
  }

  let nextPhoneOutcome = phoneOutcome != null
    ? String(phoneOutcome).trim()
    : (existing?.phone_outcome || null);
  if (nextPhoneOutcome && !VALID_PHONE_OUTCOMES.has(nextPhoneOutcome)) {
    return { error: { status: 400, message: 'Invalid phone outcome' } };
  }
  if (nextMethod !== 'phone') nextPhoneOutcome = null;

  let nextReplyStatus = replyStatus != null
    ? String(replyStatus).trim()
    : (existing?.reply_status || null);
  if (nextReplyStatus && !VALID_REPLY_STATUSES.has(nextReplyStatus)) {
    return { error: { status: 400, message: 'Invalid reply status' } };
  }

  let nextAttendance = attendanceOutcome != null
    ? String(attendanceOutcome).trim()
    : (existing?.attendance_outcome || null);
  if (nextAttendance && !VALID_ATTENDANCE_OUTCOMES.has(nextAttendance)) {
    return { error: { status: 400, message: 'Invalid attendance outcome' } };
  }

  let nextAbsenceReason = absenceReason != null
    ? String(absenceReason).trim().slice(0, 500)
    : (existing?.absence_reason || null);

  if (reopenPending && existing) {
    nextAttendance = 'pending';
    nextReplyStatus = nextReplyStatus || existing.reply_status || 'auto_reply';
  }

  if (nextAttendance === 'pending' && !nextReplyStatus) {
    nextReplyStatus = 'auto_reply';
  }

  if (nextAttendance === 'not_attending' && (!nextAbsenceReason || nextAbsenceReason.length < 2)) {
    return { error: { status: 400, message: 'Enter a reason when marking not attending.' } };
  }
  if (nextAttendance !== 'not_attending') {
    nextAbsenceReason = null;
  }

  const contactedAt = (markContacted || existing?.contacted_at)
    ? (existing?.contacted_at || new Date())
    : null;
  let resolvedAt = null;
  if (reopenPending) {
    resolvedAt = null;
  } else if (nextAttendance === 'attending' || nextAttendance === 'not_attending') {
    resolvedAt = new Date();
  }

  let absentResult = null;
  if (nextAttendance === 'not_attending') {
    absentResult = await markEventDayClientAbsentWithFreeText({
      eventId: eid,
      agencyId: aid,
      clientId: cid,
      kioskDate: day,
      absenceReasonText: nextAbsenceReason,
      ipAddress
    });
    if (absentResult.error) return absentResult;
  }

  const vals = [
    nextStaffUserId || null,
    targetType,
    targetRef,
    targetName,
    targetRelationship,
    targetPhone,
    targetEmail,
    nextMethod,
    nextPhoneOutcome,
    nextReplyStatus,
    nextAttendance,
    nextAbsenceReason,
    contactedAt,
    resolvedAt
  ];

  if (existing?.id) {
    await pool.execute(
      `UPDATE event_day_kiosk_late_contacts
       SET staff_user_id = ?,
           contact_target_type = ?,
           contact_target_ref = ?,
           contact_name = ?,
           contact_relationship = ?,
           contact_phone = ?,
           contact_email = ?,
           contact_method = ?,
           phone_outcome = ?,
           reply_status = ?,
           attendance_outcome = ?,
           absence_reason = ?,
           contacted_at = COALESCE(?, contacted_at),
           resolved_at = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [...vals, existing.id]
    );
  } else {
    await pool.execute(
      `INSERT INTO event_day_kiosk_late_contacts
         (company_event_id, agency_id, client_id, kiosk_date,
          staff_user_id, contact_target_type, contact_target_ref,
          contact_name, contact_relationship, contact_phone, contact_email,
          contact_method, phone_outcome, reply_status, attendance_outcome,
          absence_reason, contacted_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [eid, aid, cid, day, ...vals]
    );
  }

  const [savedRows] = await pool.execute(
    `SELECT *
     FROM event_day_kiosk_late_contacts
     WHERE company_event_id = ? AND client_id = ? AND kiosk_date = ?
     LIMIT 1`,
    [eid, cid, day]
  );

  return {
    ok: true,
    log: mapLateContactRow(savedRows?.[0]),
    absent: absentResult || null
  };
}
