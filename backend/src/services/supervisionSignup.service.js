import pool from '../config/database.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import User from '../models/User.model.js';
import {
  utcMysqlToIso,
  subtractHoursFromUtcMysql,
  dateToMysqlUtcDateTime
} from '../utils/zonedWallTime.util.js';

function normalizeEnrollmentMode(raw) {
  const mode = String(raw || 'invited').trim().toLowerCase();
  if (mode === 'signup_only' || mode === 'open_join') return mode;
  return 'invited';
}

function isSignupSession(row) {
  return normalizeEnrollmentMode(row?.enrollment_mode || row?.enrollmentMode) === 'signup_only';
}

function toUtcMs(value) {
  const iso = utcMysqlToIso(value);
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export async function userBelongsToAgency(userId, agencyId) {
  const uid = Number(userId || 0);
  const aid = Number(agencyId || 0);
  if (!uid || !aid) return false;
  const agencies = await User.getAgencies(uid);
  return (agencies || []).some((a) => Number(a?.id) === aid);
}

export async function countSessionSignups(sessionId) {
  const sid = Number(sessionId || 0);
  if (!sid) return 0;
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS c
       FROM supervision_session_attendees
       WHERE session_id = ?
         AND participant_role = 'supervisee'
         AND UPPER(COALESCE(status, '')) IN ('SIGNED_UP', 'JOINED', 'INVITED')`,
      [sid]
    );
    return Number(rows?.[0]?.c || 0);
  } catch {
    return 0;
  }
}

export async function getViewerSignupState(sessionId, userId) {
  const sid = Number(sessionId || 0);
  const uid = Number(userId || 0);
  if (!sid || !uid) return { signedUp: false, status: null };
  try {
    const [rows] = await pool.execute(
      `SELECT status
       FROM supervision_session_attendees
       WHERE session_id = ? AND user_id = ?
       LIMIT 1`,
      [sid, uid]
    );
    const status = String(rows?.[0]?.status || '').trim().toUpperCase();
    const signedUp = ['SIGNED_UP', 'JOINED', 'INVITED'].includes(status)
      && status !== 'WITHDRAWN';
    return { signedUp, status: status || null };
  } catch {
    return { signedUp: false, status: null };
  }
}

/** Signup close instant as UTC MySQL DATETIME (stored UTC after migration 1097). */
export function getSignupClosesAtUtc(sessionRow) {
  const explicit = sessionRow?.signup_closes_at || sessionRow?.signupClosesAt;
  if (explicit) {
    const iso = utcMysqlToIso(explicit);
    if (iso) return dateToMysqlUtcDateTime(new Date(iso));
  }
  const start = sessionRow?.start_at || sessionRow?.startAt;
  if (!start) return null;
  return subtractHoursFromUtcMysql(start, 1);
}

export function isSignupOpen(sessionRow, now = new Date()) {
  if (!isSignupSession(sessionRow)) return false;
  if (String(sessionRow?.status || '').toUpperCase() === 'CANCELLED') return false;
  const closesAt = getSignupClosesAtUtc(sessionRow);
  const closesMs = toUtcMs(closesAt);
  if (closesMs == null) return false;
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return nowMs < closesMs;
}

export async function canUserSignup({ sessionRow, userId, now = new Date() }) {
  if (!isSignupSession(sessionRow)) {
    return { ok: false, reason: 'not_signup_session' };
  }
  if (String(sessionRow?.status || '').toUpperCase() === 'CANCELLED') {
    return { ok: false, reason: 'cancelled' };
  }
  const uid = Number(userId || 0);
  const agencyId = Number(sessionRow?.agency_id || 0);
  if (!uid || !agencyId) return { ok: false, reason: 'invalid_user' };
  if (!await userBelongsToAgency(uid, agencyId)) {
    return { ok: false, reason: 'not_in_agency' };
  }
  if (uid === Number(sessionRow?.supervisor_user_id || 0)
    || uid === Number(sessionRow?.co_facilitator_user_id || 0)) {
    return { ok: false, reason: 'facilitator' };
  }
  if (!isSignupOpen(sessionRow, now)) {
    return { ok: false, reason: 'signup_closed' };
  }
  const existing = await getViewerSignupState(Number(sessionRow?.id || 0), uid);
  if (existing.signedUp) {
    return { ok: false, reason: 'already_signed_up' };
  }
  return { ok: true };
}

export async function signupForSession({ sessionId, userId }) {
  const sid = Number(sessionId || 0);
  const uid = Number(userId || 0);
  if (!sid || !uid) throw new Error('Invalid session or user');
  const row = await SupervisionSession.findById(sid);
  if (!row) throw new Error('Session not found');
  const gate = await canUserSignup({ sessionRow: row, userId: uid });
  if (!gate.ok) {
    const err = new Error(gate.reason || 'signup_not_allowed');
    err.code = gate.reason || 'signup_not_allowed';
    throw err;
  }
  // Open-signup supervisees are never compensable; only the facilitator is paid.
  await SupervisionSession.upsertAttendees(sid, [{
    userId: uid,
    participantRole: 'supervisee',
    isRequired: false,
    isCompensableSnapshot: false,
    status: 'SIGNED_UP'
  }]);
  try {
    await pool.execute(
      `UPDATE supervision_session_attendees
       SET signed_up_at = COALESCE(signed_up_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
       WHERE session_id = ? AND user_id = ?`,
      [sid, uid]
    );
  } catch {
    /* signed_up_at optional until migration */
  }
  return {
    sessionId: sid,
    userId: uid,
    signupCount: await countSessionSignups(sid)
  };
}

export async function withdrawFromSession({ sessionId, userId }) {
  const sid = Number(sessionId || 0);
  const uid = Number(userId || 0);
  if (!sid || !uid) throw new Error('Invalid session or user');
  const row = await SupervisionSession.findById(sid);
  if (!row || !isSignupSession(row)) throw new Error('Not a signup session');
  if (!isSignupOpen(row)) {
    const err = new Error('signup_closed');
    err.code = 'signup_closed';
    throw err;
  }
  await pool.execute(
    `UPDATE supervision_session_attendees
     SET status = 'WITHDRAWN', updated_at = CURRENT_TIMESTAMP
     WHERE session_id = ? AND user_id = ? AND participant_role = 'supervisee'`,
    [sid, uid]
  );
  return {
    sessionId: sid,
    userId: uid,
    signupCount: await countSessionSignups(sid)
  };
}

export { isSignupSession, normalizeEnrollmentMode };
