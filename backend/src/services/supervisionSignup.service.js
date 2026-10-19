import { getSupervisionSignupWindow } from './supervisionSignupWindow.js';
import pool from '../config/database.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import { workplacePersonSql } from '../utils/workplacePeople.js';
import {
  utcMysqlToIso,
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

function isTruthyFlag(v) {
  return v === true || v === 1 || v === '1';
}

function hasOpenJoinAudienceFlags(row) {
  return isTruthyFlag(row?.invite_audience_all_supervised)
    || isTruthyFlag(row?.invite_audience_group_support)
    || ['open_to_all', 'open_and_invited'].includes(String(row?.invite_scope || '').trim().toLowerCase());
}

async function userMatchesOpenJoinAudience(sessionRow, userId) {
  const agencyId = Number(sessionRow?.agency_id || 0);
  const uid = Number(userId || 0);
  if (!agencyId || !uid || !hasOpenJoinAudienceFlags(sessionRow)) return false;
  const audienceAll = isTruthyFlag(sessionRow?.invite_audience_all_supervised);
  const audienceGroup = isTruthyFlag(sessionRow?.invite_audience_group_support);
  if (audienceAll || audienceGroup) {
    const [rows] = await pool.execute(
      `SELECT supervision_is_prelicensed, supervision_start_group_hours
       FROM user_agencies
       WHERE agency_id = ? AND user_id = ?
       LIMIT 1`,
      [agencyId, uid]
    );
    const ua = rows?.[0];
    if (!ua) return false;
    const isPrelicensed = isTruthyFlag(ua.supervision_is_prelicensed);
    const needsGroupHours = Number(ua.supervision_start_group_hours || 0) > 0;
    if (audienceAll && isPrelicensed) return true;
    if (audienceGroup && isPrelicensed && needsGroupHours) return true;
    return false;
  }
  const [assigned] = await pool.execute(
    `SELECT 1
     FROM supervisor_assignments
     WHERE supervisor_id = ? AND supervisee_id = ? AND agency_id = ?
     LIMIT 1`,
    [Number(sessionRow?.supervisor_user_id || 0), uid, agencyId]
  );
  return !!(assigned || []).length;
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
  const [members] = await pool.execute(`SELECT u.id FROM users u
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    JOIN agencies org ON org.id=ua.agency_id AND org.is_active=1
    WHERE u.id=? AND ${workplacePersonSql('u')}
      AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_demo,0)=0 AND COALESCE(u.is_archived,0)=0
      AND LOWER(u.role) IN ('provider','provider_plus','clinician','supervisor','admin','super_admin','superadmin','support','staff','intern','clinical_practice_assistant')
      AND UPPER(COALESCE(u.status,'')) NOT IN ('INACTIVE','INACTIVE_EMPLOYEE','ARCHIVED','TERMINATED','DELETED','PROSPECTIVE') LIMIT 1`, [aid,uid]);
  return !!members.length;
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
         AND UPPER(COALESCE(status, '')) IN ('SIGNED_UP', 'JOINED')`,
      [sid]
    );
    return Number(rows?.[0]?.c || 0);
  } catch {
    return 0;
  }
}

export async function getViewerSignupState(sessionId, userId, { signupOnly = false } = {}) {
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
    const signedUp = (signupOnly ? ['SIGNED_UP','JOINED'] : ['SIGNED_UP', 'JOINED', 'INVITED']).includes(status)
      && status !== 'WITHDRAWN';
    return { signedUp, status: status || null };
  } catch {
    return { signedUp: false, status: null };
  }
}

/** Signup close instant as UTC MySQL DATETIME (stored UTC after migration 1097). */
export function getSignupClosesAtUtc(sessionRow) {
  const close = getSupervisionSignupWindow(sessionRow).signupClosesAt;
  return close ? dateToMysqlUtcDateTime(new Date(close)) : null;
}

export function isSignupOpen(sessionRow, now = new Date()) {
  const isAgencySignup = isSignupSession(sessionRow);
  const isOpenJoin = !isAgencySignup && hasOpenJoinAudienceFlags(sessionRow);
  if (!isAgencySignup && !isOpenJoin) return false;
  if (String(sessionRow?.status || '').toUpperCase() === 'CANCELLED') return false;
  // Open-join hybrid sessions stay claimable until the session ends.
  if (isOpenJoin) {
    const endMs = toUtcMs(sessionRow?.end_at || sessionRow?.endAt);
    const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
    if (endMs == null) return true;
    return nowMs < endMs;
  }
  return getSupervisionSignupWindow(sessionRow, now).signupOpen;
}

export async function canUserSignup({ sessionRow, userId, now = new Date() }) {
  const isAgencySignup = isSignupSession(sessionRow);
  const isOpenJoin = !isAgencySignup && hasOpenJoinAudienceFlags(sessionRow);
  if (!isAgencySignup && !isOpenJoin) {
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
  if (isOpenJoin && !(await userMatchesOpenJoinAudience(sessionRow, uid))) {
    return { ok: false, reason: 'not_signup_session' };
  }
  if (!isSignupOpen(sessionRow, now)) {
    return { ok: false, reason: isAgencySignup && getSupervisionSignupWindow(sessionRow, now).signupState === 'upcoming' ? 'signup_not_open' : 'signup_closed' };
  }
  const existing = await getViewerSignupState(Number(sessionRow?.id || 0), uid, {signupOnly:isAgencySignup});
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
  if (!row) throw new Error('Not a signup session');
  const isAgencySignup = isSignupSession(row);
  const isOpenJoin = !isAgencySignup && hasOpenJoinAudienceFlags(row);
  if (!isAgencySignup && !isOpenJoin) throw new Error('Not a signup session');
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

// Dismissing an optional open offering records an opt-out for this date only.
// It never registers attendance, and an explicit later signup may replace it.
export async function dismissSupervisionSignup({ sessionId, userId, now = new Date() }) {
  const row = await SupervisionSession.findById(Number(sessionId));
  if (!row || !isSignupSession(row) || row.status !== 'SCHEDULED' || !(toUtcMs(row.start_at) > +now)) {
    throw Object.assign(new Error('This signup invitation is no longer available.'), { status: 410 });
  }
  if (!await userBelongsToAgency(userId, row.agency_id)) throw Object.assign(new Error('Access denied.'), { status: 403 });
  if ([row.supervisor_user_id, row.co_facilitator_user_id].some(id => Number(id) === Number(userId))) {
    throw Object.assign(new Error('Hosts cannot dismiss their own session.'), { status: 400 });
  }
  await pool.execute("INSERT INTO supervision_session_attendees (session_id,user_id,participant_role,is_required,is_compensable_snapshot,status) VALUES (?,?,'supervisee',0,0,'DECLINED') ON DUPLICATE KEY UPDATE status='DECLINED',decline_reason=NULL,updated_at=UTC_TIMESTAMP()", [Number(sessionId),Number(userId)]);
  return { ok:true, response:'declined' };
}
