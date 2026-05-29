import pool from '../config/database.js';

/** Preset reasons shown on the kiosk absent flow. */
export const EVENT_DAY_KIOSK_ABSENCE_REASONS = [
  { code: 'family_confirmed', label: 'Family confirmed not attending' },
  { code: 'sick', label: 'Sick / not feeling well' },
  { code: 'schedule_conflict', label: 'Schedule conflict' },
  { code: 'travel', label: 'Travel / vacation' },
  { code: 'other', label: 'Other' }
];

const REASON_BY_CODE = new Map(EVENT_DAY_KIOSK_ABSENCE_REASONS.map((r) => [r.code, r.label]));

function isUnknownConfirmationColumnError(err) {
  const msg = String(err?.message || '');
  return msg.includes('Unknown column') && msg.includes('confirmation_status');
}

/**
 * @param {number} eventId
 * @param {number[]} clientIds
 * @returns {Promise<Map<number, { confirmationStatus: string, confirmationSetAt: string|null, confirmationSetMethod: string|null }>>}
 */
export async function loadClientConfirmationStatusByEvent(eventId, clientIds) {
  const eid = Number(eventId);
  const ids = [...new Set((clientIds || []).map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
  const out = new Map();
  if (!eid || !ids.length) return out;

  const ph = ids.map(() => '?').join(',');
  try {
    const [rows] = await pool.execute(
      `SELECT client_id, confirmation_status, confirmation_set_at, confirmation_set_method
       FROM company_event_clients
       WHERE company_event_id = ? AND client_id IN (${ph})`,
      [eid, ...ids]
    );
    for (const r of rows || []) {
      const cid = Number(r.client_id);
      if (!cid) continue;
      out.set(cid, {
        confirmationStatus: r.confirmation_status ? String(r.confirmation_status).toLowerCase() : 'pending',
        confirmationSetAt: r.confirmation_set_at || null,
        confirmationSetMethod: r.confirmation_set_method || null
      });
    }
  } catch (err) {
    if (isUnknownConfirmationColumnError(err)) return out;
    throw err;
  }
  return out;
}

export function resolveAbsenceReasonText(reasonCode, reasonNotes = '') {
  const code = String(reasonCode || '').trim().toLowerCase();
  const notes = String(reasonNotes || '').trim().slice(0, 400);
  const label = REASON_BY_CODE.get(code);
  if (!label) return null;
  if (code === 'other') {
    if (notes.length < 2) return null;
    return notes;
  }
  if (notes) return `${label} — ${notes}`;
  return label;
}

/**
 * Mark absent with free-text reason (late contact workflow — no pre-confirmation required).
 */
export async function markEventDayClientAbsentWithFreeText({
  eventId,
  agencyId,
  clientId,
  kioskDate,
  absenceReasonText,
  ipAddress = null
}) {
  const eid = Number(eventId);
  const aid = Number(agencyId);
  const cid = Number(clientId);
  const day = String(kioskDate || '').trim();
  const absenceReason = String(absenceReasonText || '').trim().slice(0, 500);
  if (!eid || !aid || !cid || !day) {
    return { error: { status: 400, message: 'eventId, agencyId, clientId, and kioskDate are required' } };
  }
  if (absenceReason.length < 2) {
    return { error: { status: 400, message: 'An absence reason is required' } };
  }

  try {
    const [cecRows] = await pool.execute(
      `SELECT 1 AS ok
       FROM company_event_clients
       WHERE company_event_id = ? AND client_id = ?
         AND (is_active = TRUE OR is_active IS NULL)
       LIMIT 1`,
      [eid, cid]
    );
    if (!cecRows?.[0]?.ok) {
      return { error: { status: 403, message: 'Client is not a participant for this event' } };
    }
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return { error: { status: 403, message: 'Client is not a participant for this event' } };
    }
    throw err;
  }

  let existingRows = [];
  try {
    const [rows] = await pool.execute(
      `SELECT id, action
       FROM event_day_kiosk_checkins
       WHERE company_event_id = ? AND client_id = ? AND kiosk_date = ? AND person_type = 'client'
       ORDER BY id DESC
       LIMIT 1`,
      [eid, cid, day]
    );
    existingRows = rows || [];
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return { error: { status: 503, message: 'Run migration 615 for event-day check-ins' } };
    }
    throw err;
  }

  const existing = existingRows[0];
  const existingState = formatExistingClientDayAction(existing);
  if (existingState === 'checked_in') {
    return { error: { status: 409, message: 'Client is already checked in for today.' } };
  }

  const recordedAt = new Date().toISOString();
  try {
    if (existing?.id) {
      await pool.execute(
        `UPDATE event_day_kiosk_checkins
         SET action = 'absent',
             absence_reason = ?,
             checked_in_at = NOW(),
             checked_out_at = NULL,
             updated_at = NOW(),
             ip_address = ?
         WHERE id = ?`,
        [absenceReason, ipAddress, existing.id]
      );
    } else {
      await pool.execute(
        `INSERT INTO event_day_kiosk_checkins
           (company_event_id, agency_id, client_id, person_type, action, checked_in_at, kiosk_date, ip_address, absence_reason)
         VALUES (?, ?, ?, 'client', 'absent', NOW(), ?, ?, ?)`,
        [eid, aid, cid, day, ipAddress, absenceReason]
      );
    }
  } catch (err) {
    if (err?.code === 'ER_BAD_FIELD_ERROR' && String(err?.message || '').includes('absence_reason')) {
      return { error: { status: 503, message: 'Run migration 826 for absent tracking' } };
    }
    if (String(err?.message || '').includes("'absent'")) {
      return { error: { status: 503, message: 'Run migration 826 for absent tracking' } };
    }
    throw err;
  }

  return { ok: true, clientId: cid, absenceReason, recordedAt };
}

function formatExistingClientDayAction(row) {
  const action = String(row?.action || '').trim();
  if (action === 'check_in') return 'checked_in';
  if (action === 'absent') return 'absent';
  if (action === 'check_out') return 'checked_out';
  return action || null;
}

/**
 * Record a client as absent for today's event session at the kiosk.
 *
 * @returns {Promise<{ ok: true, clientId: number, absenceReason: string, recordedAt: string } | { error: { status: number, message: string, code?: string } }>}
 */
export async function markEventDayClientAbsent({
  eventId,
  agencyId,
  clientId,
  kioskDate,
  reasonCode,
  reasonNotes = '',
  ipAddress = null
}) {
  const eid = Number(eventId);
  const aid = Number(agencyId);
  const cid = Number(clientId);
  const day = String(kioskDate || '').trim();
  if (!eid || !aid || !cid || !day) {
    return { error: { status: 400, message: 'eventId, agencyId, clientId, and kioskDate are required' } };
  }

  const absenceReason = resolveAbsenceReasonText(reasonCode, reasonNotes);
  if (!absenceReason) {
    return { error: { status: 400, message: 'A valid absence reason is required' } };
  }

  let confirmationStatus = 'pending';
  try {
    const [cecRows] = await pool.execute(
      `SELECT confirmation_status
       FROM company_event_clients
       WHERE company_event_id = ? AND client_id = ?
         AND (is_active = TRUE OR is_active IS NULL)
       LIMIT 1`,
      [eid, cid]
    );
    if (!cecRows?.[0]) {
      return { error: { status: 403, message: 'Client is not a participant for this event' } };
    }
    confirmationStatus = cecRows[0].confirmation_status
      ? String(cecRows[0].confirmation_status).toLowerCase()
      : 'pending';
  } catch (err) {
    if (isUnknownConfirmationColumnError(err)) {
      return {
        error: {
          status: 409,
          code: 'CONFIRMATION_NOT_AVAILABLE',
          message: 'Attendance confirmation is not available yet. Run migration 803.'
        }
      };
    }
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return { error: { status: 403, message: 'Client is not a participant for this event' } };
    }
    throw err;
  }

  if (confirmationStatus !== 'no') {
    return {
      error: {
        status: 409,
        code: 'CONFIRMATION_REQUIRED',
        message: 'Absent can only be recorded when the family has confirmed they are not attending.'
      }
    };
  }

  let existingRows = [];
  try {
    const [rows] = await pool.execute(
      `SELECT id, action
       FROM event_day_kiosk_checkins
       WHERE company_event_id = ? AND client_id = ? AND kiosk_date = ? AND person_type = 'client'
       ORDER BY id DESC
       LIMIT 1`,
      [eid, cid, day]
    );
    existingRows = rows || [];
  } catch (err) {
    if (err?.code === 'ER_NO_SUCH_TABLE') {
      return { error: { status: 503, message: 'Run migration 615 for event-day check-ins' } };
    }
    throw err;
  }

  const existing = existingRows[0];
  const existingState = formatExistingClientDayAction(existing);
  if (existingState === 'checked_in') {
    return { error: { status: 409, message: 'Client is already checked in for today.' } };
  }
  if (existingState === 'absent') {
    return { error: { status: 409, message: 'Client is already marked absent for today.' } };
  }

  const recordedAt = new Date().toISOString();
  try {
    if (existing?.id) {
      await pool.execute(
        `UPDATE event_day_kiosk_checkins
         SET action = 'absent',
             absence_reason = ?,
             checked_in_at = NOW(),
             checked_out_at = NULL,
             updated_at = NOW(),
             ip_address = ?
         WHERE id = ?`,
        [absenceReason, ipAddress, existing.id]
      );
    } else {
      await pool.execute(
        `INSERT INTO event_day_kiosk_checkins
           (company_event_id, agency_id, client_id, person_type, action, checked_in_at, kiosk_date, ip_address, absence_reason)
         VALUES (?, ?, ?, 'client', 'absent', NOW(), ?, ?, ?)`,
        [eid, aid, cid, day, ipAddress, absenceReason]
      );
    }
  } catch (err) {
    if (err?.code === 'ER_BAD_FIELD_ERROR' && String(err?.message || '').includes('absence_reason')) {
      return { error: { status: 503, message: 'Run migration 826 for absent tracking' } };
    }
    if (String(err?.message || '').includes("'absent'")) {
      return { error: { status: 503, message: 'Run migration 826 for absent tracking' } };
    }
    throw err;
  }

  return {
    ok: true,
    clientId: cid,
    absenceReason,
    recordedAt
  };
}
