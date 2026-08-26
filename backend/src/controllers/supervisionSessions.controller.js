import { body, validationResult } from 'express-validator';
import User from '../models/User.model.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import SupervisionSessionArtifact from '../models/SupervisionSessionArtifact.model.js';
import SupervisionSessionPersonalNote from '../models/SupervisionSessionPersonalNote.model.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';
import GoogleCalendarService from '../services/googleCalendar.service.js';
import { fetchMeetTranscriptForSession } from '../services/googleMeetTranscript.service.js';
import {
  isVideoConfigured,
  createOrGetRoomByUniqueName,
  createAccessTokenAsync,
  listRoomParticipants,
  resolveVideoProjectId,
  getVideoClientDiagnostics,
  completeRoom
} from '../services/video.service.js';
import PayrollRateCard from '../models/PayrollRateCard.model.js';
import PayrollRate from '../models/PayrollRate.model.js';
import { callGeminiText } from '../services/geminiText.service.js';
import pool from '../config/database.js';
import { isAdminLikeRole, isSupervisorActor } from '../utils/supervisorSchoolAccess.js';
import crypto from 'crypto';
import { joinUrlForSupervision, isNumericJoinRef } from '../utils/joinToken.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import SupervisionCasePresentation from '../models/SupervisionCasePresentation.model.js';
import {
  wallMysqlToUtcMysql,
  normalizeWallMysqlDatetime,
  subtractHoursFromUtcMysql,
  DEFAULT_SCHEDULE_TZ
} from '../utils/zonedWallTime.util.js';
import { isSupervisionPayEligibleHours, normalizeSupervisionStartDateYmd } from '../utils/supervisionHoursGate.util.js';

const JOIN_PRESENCE_STALE_SECONDS = 25;

function userIdFromSupervisionJoinIdentity(joinIdentity) {
  const m = /^user-(\d+)$/i.exec(String(joinIdentity || '').trim());
  return m ? Number(m[1]) : 0;
}

async function resolveSupervisionClosedByName(row, fallbackUserId = null) {
  const uid = Number(row?.live_ended_by_user_id || fallbackUserId || 0);
  if (!uid) return '';
  try {
    const [rows] = await pool.execute(
      `SELECT first_name, last_name, email
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [uid]
    );
    const u = rows?.[0];
    if (!u) return '';
    const name = `${u.first_name || ''} ${u.last_name || ''}`.trim();
    return name || String(u.email || '').trim() || '';
  } catch {
    return '';
  }
}

function isPresenceLastSeenStale(lastSeenAt, staleSeconds = JOIN_PRESENCE_STALE_SECONDS) {
  const atMs = parseAsDate(lastSeenAt)?.getTime();
  if (!Number.isFinite(atMs)) return true;
  return (Date.now() - atMs) > Number(staleSeconds) * 1000;
}

async function ensureSupervisionAttendeeForUser(sessionRow, sessionId, userId) {
  const sid = Number(sessionId || 0);
  const uid = Number(userId || 0);
  if (!sid || !uid) return null;
  let attendee = await SupervisionSession.findAttendeeBySessionUser(sid, uid);
  if (attendee) return attendee;
  const role = Number(sessionRow?.supervisor_user_id || 0) === uid ? 'supervisor' : 'supervisee';
  await SupervisionSession.upsertAttendees(sid, [{
    userId: uid,
    participantRole: role,
    isRequired: true,
    isCompensableSnapshot: false,
    status: 'INVITED'
  }]);
  attendee = await SupervisionSession.findAttendeeBySessionUser(sid, uid);
  return attendee || null;
}

async function recordSupervisionPresenceAttendanceEvent({
  sessionRow,
  sessionId,
  userId,
  joinIdentity,
  eventType
}) {
  const sid = Number(sessionId || 0);
  const uid = Number(userId || 0);
  const evType = String(eventType || '').trim().toLowerCase();
  if (!sid || !uid || !['joined', 'left'].includes(evType)) return null;
  const attendee = await ensureSupervisionAttendeeForUser(sessionRow, sid, uid);
  const eventAt = mysqlNowDateTime();
  const clientSessionKey = `live-presence-${sid}-${uid}-${String(joinIdentity || '').trim()}`;
  await SupervisionSession.recordAttendanceEvent({
    sessionId: sid,
    attendeeId: Number(attendee?.id || 0) || null,
    userId: uid,
    participantSessionKey: clientSessionKey,
    eventType: evType,
    eventAt,
    rawPayload: {
      source: 'live_join_presence',
      joinIdentity: String(joinIdentity || '').trim()
    }
  });
  await SupervisionSession.setAttendeeStatus({
    sessionId: sid,
    userId: uid,
    status: evType === 'joined' ? 'JOINED' : 'LEFT'
  });
  return recomputeAttendanceRollupForUser({
    sessionId: sid,
    userId: uid,
    sessionStartAt: sessionRow?.start_at
  });
}

/** Open payable attendance when admitted and last ledger event is not an open join. */
async function ensureSupervisionAttendanceSegmentOpen({
  sessionRow,
  sessionId,
  userId,
  joinIdentity
}) {
  const sid = Number(sessionId || 0);
  const uid = Number(userId || 0);
  const identity = String(joinIdentity || (uid ? `user-${uid}` : '')).trim();
  if (!sid || !uid) return null;
  const admitted = await isUserAdmittedToSupervision({
    sessionId: sid,
    userId: uid,
    joinIdentity: identity
  });
  if (!admitted) return null;

  const events = await SupervisionSession.listAttendanceEventsForSessionUser({
    sessionId: sid,
    userId: uid
  });
  const lastType = String(events?.[events.length - 1]?.event_type || '').trim().toLowerCase();
  if (lastType === 'joined' || lastType === 'opened') {
    return recomputeAttendanceRollupForUser({
      sessionId: sid,
      userId: uid,
      sessionStartAt: sessionRow?.start_at
    });
  }
  return recordSupervisionPresenceAttendanceEvent({
    sessionRow,
    sessionId: sid,
    userId: uid,
    joinIdentity: identity,
    eventType: 'joined'
  });
}

/**
 * When supervision commences, align attendance for everyone actively in the main room.
 * People who are only waiting in the lobby are deliberately excluded.
 */
async function commenceSupervisionAttendance({ sessionRow, sessionId, includeUserIds = [] }) {
  const sid = Number(sessionId || sessionRow?.id || 0);
  if (!sid || !sessionRow) return { opened: 0 };
  const activeIds = await getActiveSupervisionPresenceUserIds(sid);
  const userIds = new Set([
    ...(activeIds || []),
    ...(includeUserIds || [])
  ].map(Number).filter((uid) => uid > 0));
  const facilitatorIds = new Set([
    Number(sessionRow.supervisor_user_id || 0),
    Number(sessionRow.co_facilitator_user_id || 0)
  ].filter((uid) => uid > 0));

  let opened = 0;
  for (const uid of userIds) {
    const identity = `user-${uid}`;
    // eslint-disable-next-line no-await-in-loop
    const isMainRoom = facilitatorIds.has(uid) || await isUserAdmittedToSupervision({
      sessionId: sid,
      userId: uid,
      joinIdentity: identity
    });
    if (!isMainRoom) continue;
    // Facilitators normally receive an admission on token mint; repair it if necessary so
    // the attendance helper uses one consistent main-room rule.
    if (facilitatorIds.has(uid)) {
      // eslint-disable-next-line no-await-in-loop
      await admitSupervisionJoinIdentity({ sessionId: sid, userId: uid, joinIdentity: identity });
    }
    // eslint-disable-next-line no-await-in-loop
    const result = await ensureSupervisionAttendanceSegmentOpen({
      sessionRow,
      sessionId: sid,
      userId: uid,
      joinIdentity: identity
    });
    if (result) opened += 1;
  }
  return { opened };
}

async function loadSupervisionPresenceByUser(sessionId, {
  staleSeconds = JOIN_PRESENCE_STALE_SECONDS
} = {}) {
  const sid = Number(sessionId || 0);
  if (!sid) return new Map();
  const [rows] = await pool.execute(
    `SELECT join_identity, joined_at, last_seen_at, left_at
     FROM supervision_session_join_presence
     WHERE session_id = ?`,
    [sid]
  );
  const out = new Map();
  for (const row of rows || []) {
    const uid = userIdFromSupervisionJoinIdentity(row.join_identity);
    if (!uid) continue;
    const stale = isPresenceLastSeenStale(row.last_seen_at, staleSeconds);
    const isPresent = !row.left_at && !stale;
    out.set(uid, {
      isPresent,
      leftAt: row.left_at || null,
      joinedAt: row.joined_at || null,
      lastSeenAt: row.last_seen_at || null
    });
  }
  return out;
}

async function pruneStaleJoinPresence(sessionId, { sessionRow = null } = {}) {
  const sid = Number(sessionId || 0);
  if (!sid) return;
  let row = sessionRow;
  if (!row) {
    try {
      row = await SupervisionSession.findById(sid);
    } catch {
      row = null;
    }
  }
  try {
    const [stale] = await pool.execute(
      `SELECT join_identity
       FROM supervision_session_join_presence
       WHERE session_id = ?
         AND left_at IS NULL
         AND last_seen_at < (UTC_TIMESTAMP() - INTERVAL ${JOIN_PRESENCE_STALE_SECONDS} SECOND)`,
      [sid]
    );
    if (!stale?.length) return;
    await pool.execute(
      `UPDATE supervision_session_join_presence
       SET left_at = UTC_TIMESTAMP()
       WHERE session_id = ?
         AND left_at IS NULL
         AND last_seen_at < (UTC_TIMESTAMP() - INTERVAL ${JOIN_PRESENCE_STALE_SECONDS} SECOND)`,
      [sid]
    );
    for (const entry of stale) {
      const identity = String(entry.join_identity || '').trim();
      const uid = userIdFromSupervisionJoinIdentity(identity);
      if (!uid || !row) continue;
      // Lobby waiters are not in the main room yet — do not mark them LEFT in attendance.
      // eslint-disable-next-line no-await-in-loop
      const admitted = await isUserAdmittedToSupervision({
        sessionId: sid,
        userId: uid,
        joinIdentity: identity
      });
      if (!admitted) continue;
      // eslint-disable-next-line no-await-in-loop
      await recordSupervisionPresenceAttendanceEvent({
        sessionRow: row,
        sessionId: sid,
        userId: uid,
        joinIdentity: identity,
        eventType: 'left'
      });
    }
  } catch {
    /* ignore */
  }
}

async function getActiveSupervisionPresenceUserIds(sessionId) {
  const sid = Number(sessionId || 0);
  if (!sid) return [];
  const [rows] = await pool.execute(
    `SELECT join_identity
     FROM supervision_session_join_presence
     WHERE session_id = ?
       AND left_at IS NULL
       AND last_seen_at >= (UTC_TIMESTAMP() - INTERVAL ${JOIN_PRESENCE_STALE_SECONDS} SECOND)`,
    [sid]
  );
  const ids = [];
  for (const row of rows || []) {
    const uid = userIdFromSupervisionJoinIdentity(row.join_identity);
    if (uid) ids.push(uid);
  }
  return ids;
}

/**
 * Waiting-room host presence for supervisees/guests.
 * Role label is Supervisor today; keep extensible for provider/tutor sessions later.
 */
async function buildWaitingRoomHostStatus(row) {
  const sid = Number(row?.id || 0);
  const hostIds = [
    Number(row?.supervisor_user_id || 0),
    Number(row?.co_facilitator_user_id || 0)
  ].filter((n) => n > 0);
  const hostRoleLabel = 'Supervisor';
  if (!sid || !hostIds.length) {
    return {
      hostPresent: false,
      hostRoleLabel,
      hostStatusLabel: `Your ${hostRoleLabel.toLowerCase()} hasn’t joined yet`
    };
  }
  // Slightly looser than attendance stale window so heartbeat jitter doesn’t flicker the pill.
  const hostStaleSeconds = Math.max(JOIN_PRESENCE_STALE_SECONDS, 45);
  let hostPresent = false;
  try {
    const [rows] = await pool.execute(
      `SELECT join_identity
       FROM supervision_session_join_presence
       WHERE session_id = ?
         AND left_at IS NULL
         AND last_seen_at >= (UTC_TIMESTAMP() - INTERVAL ${hostStaleSeconds} SECOND)`,
      [sid]
    );
    const presentSet = new Set();
    for (const r of rows || []) {
      const uid = userIdFromSupervisionJoinIdentity(r.join_identity);
      if (uid) presentSet.add(uid);
    }
    hostPresent = hostIds.some((id) => presentSet.has(id));
  } catch {
    hostPresent = false;
  }
  return {
    hostPresent,
    hostRoleLabel,
    hostStatusLabel: hostPresent
      ? `Your ${hostRoleLabel.toLowerCase()} is in the room`
      : `Your ${hostRoleLabel.toLowerCase()} hasn’t joined yet`
  };
}

async function syncSupervisionAttendanceWithPresence(sessionId, { sessionRow = null } = {}) {
  const sid = Number(sessionId || 0);
  if (!sid) return { ok: false };
  let row = sessionRow;
  if (!row) row = await SupervisionSession.findById(sid);
  if (!row) return { ok: false };

  await pruneStaleJoinPresence(sid, { sessionRow: row });
  const activeIds = await getActiveSupervisionPresenceUserIds(sid);
  const activeSet = new Set(activeIds);

  const rollups = await SupervisionSession.listAttendanceRollupsForSession(sid);
  const trackedUserIds = new Set(
    (rollups || []).map((r) => Number(r.user_id || 0)).filter((n) => n > 0)
  );
  for (const uid of activeIds) trackedUserIds.add(uid);

  for (const uid of trackedUserIds) {
    const events = await SupervisionSession.listAttendanceEventsForSessionUser({ sessionId: sid, userId: uid });
    const last = events?.[events.length - 1];
    const lastType = String(last?.event_type || '').trim().toLowerCase();
    if (activeSet.has(uid)) {
      const admitted = await isUserAdmittedToSupervision({ sessionId: sid, userId: uid });
      if (admitted && lastType !== 'joined') {
        // eslint-disable-next-line no-await-in-loop
        await recordSupervisionPresenceAttendanceEvent({
          sessionRow: row,
          sessionId: sid,
          userId: uid,
          joinIdentity: `user-${uid}`,
          eventType: 'joined'
        });
      } else if (admitted) {
        // Keep open-segment totals fresh while present.
        // eslint-disable-next-line no-await-in-loop
        await recomputeAttendanceRollupForUser({
          sessionId: sid,
          userId: uid,
          sessionStartAt: row.start_at
        });
      }
    } else if (lastType === 'joined') {
      // eslint-disable-next-line no-await-in-loop
      await recordSupervisionPresenceAttendanceEvent({
        sessionRow: row,
        sessionId: sid,
        userId: uid,
        joinIdentity: `user-${uid}`,
        eventType: 'left'
      });
    } else {
      // eslint-disable-next-line no-await-in-loop
      await recomputeAttendanceRollupForUser({
        sessionId: sid,
        userId: uid,
        sessionStartAt: row.start_at
      });
    }
  }
  return { ok: true, activeCount: activeIds.length };
}

async function countActiveJoinPresence(sessionId) {
  const sid = Number(sessionId || 0);
  if (!sid) return 0;
  try {
    await pruneStaleJoinPresence(sid);
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM supervision_session_join_presence
       WHERE session_id = ?
         AND left_at IS NULL
         AND last_seen_at >= (UTC_TIMESTAMP() - INTERVAL ${JOIN_PRESENCE_STALE_SECONDS} SECOND)`,
      [sid]
    );
    return Number(rows?.[0]?.cnt || 0);
  } catch {
    return 0;
  }
}

async function isJoinIdentityActive(sessionId, joinIdentity) {
  const sid = Number(sessionId || 0);
  const identity = String(joinIdentity || '').trim();
  if (!sid || !identity) return false;
  try {
    const [mine] = await pool.execute(
      `SELECT 1 FROM supervision_session_join_presence
       WHERE session_id = ? AND join_identity = ?
         AND left_at IS NULL
         AND last_seen_at >= (UTC_TIMESTAMP() - INTERVAL ${JOIN_PRESENCE_STALE_SECONDS} SECOND)
       LIMIT 1`,
      [sid, identity]
    );
    return !!(mine?.length);
  } catch {
    return false;
  }
}

async function upsertJoinPresence({ sessionId, joinIdentity, displayName = null, isGuest = false }) {
  const sid = Number(sessionId || 0);
  const identity = String(joinIdentity || '').trim();
  if (!sid || !identity) return;
  try {
    // Reset joined_at when re-entering after leave so wait-time is the current segment only.
    await pool.execute(
      `INSERT INTO supervision_session_join_presence
         (session_id, join_identity, display_name, is_guest, joined_at, last_seen_at, left_at)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), NULL)
       ON DUPLICATE KEY UPDATE
         display_name = COALESCE(VALUES(display_name), display_name),
         is_guest = VALUES(is_guest),
         joined_at = CASE
           WHEN left_at IS NOT NULL THEN UTC_TIMESTAMP()
           ELSE joined_at
         END,
         last_seen_at = UTC_TIMESTAMP(),
         left_at = NULL`,
      [sid, identity, displayName ? String(displayName).slice(0, 255) : null, isGuest ? 1 : 0]
    );
  } catch (e) {
    console.warn('[supervision] join presence upsert failed', e?.message || e);
  }
}

async function markJoinPresenceLeft({ sessionId, joinIdentity }) {
  const sid = Number(sessionId || 0);
  const identity = String(joinIdentity || '').trim();
  if (!sid || !identity) return;
  try {
    await pool.execute(
      `UPDATE supervision_session_join_presence
       SET left_at = UTC_TIMESTAMP(), last_seen_at = UTC_TIMESTAMP()
       WHERE session_id = ? AND join_identity = ? AND left_at IS NULL`,
      [sid, identity]
    );
  } catch {
    /* ignore */
  }
}

function maxJoinCapacityForSessionType(sessionType) {
  const t = String(sessionType || 'individual').toLowerCase();
  if (t === 'group') return 24;
  if (t === 'triadic') return 3;
  return 2; // individual: supervisor + supervisee
}

function supervisionAppJoinUrl(sessionRow) {
  const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  if (!frontendUrl || !sessionRow) return null;
  const key = String(
    sessionRow.participant_join_token || sessionRow.join_token || sessionRow.id || ''
  ).trim();
  return joinUrlForSupervision(frontendUrl, key);
}

function supervisionHostJoinUrl(sessionRow) {
  const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  if (!frontendUrl || !sessionRow) return null;
  const key = String(sessionRow.host_join_token || '').trim();
  if (!key) return null;
  return joinUrlForSupervision(frontendUrl, key);
}

function isWaitingRoomEnabled(sessionRow) {
  if (sessionRow?.waiting_room_enabled === undefined || sessionRow?.waiting_room_enabled === null) {
    return true;
  }
  return isTruthyFlag(sessionRow.waiting_room_enabled);
}

function displayNameFromUser(user) {
  if (!user) return '';
  return `${user.firstName || user.first_name || ''} ${user.lastName || user.last_name || ''}`.trim()
    || String(user.email || '').trim()
    || '';
}

async function profilePhotoUrlForUserId(userId) {
  const uid = Number(userId || 0);
  if (!uid) return null;
  try {
    const [rows] = await pool.execute(
      'SELECT profile_photo_path FROM users WHERE id = ? LIMIT 1',
      [uid]
    );
    return publicUploadsUrlFromStoredPath(rows?.[0]?.profile_photo_path || null) || null;
  } catch {
    return null;
  }
}

async function isUserAdmittedToSupervision({ sessionId, userId = null, joinIdentity = null }) {
  const sid = Number(sessionId || 0);
  if (!sid) return false;
  const uid = Number(userId || 0);
  const identity = String(joinIdentity || '').trim();
  try {
    if (uid > 0) {
      const [rows] = await pool.execute(
        `SELECT 1 FROM supervision_session_video_admissions
         WHERE session_id = ?
           AND (
             user_id = ?
             OR (join_identity IS NOT NULL AND BINARY join_identity = BINARY ?)
           )
         LIMIT 1`,
        [sid, uid, `user-${uid}`]
      );
      if (rows?.length) return true;
    }
    if (identity) {
      const [rows] = await pool.execute(
        `SELECT 1 FROM supervision_session_video_admissions
         WHERE session_id = ?
           AND join_identity IS NOT NULL
           AND BINARY join_identity = BINARY ?
         LIMIT 1`,
        [sid, identity]
      );
      if (rows?.length) return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function admitSupervisionJoinIdentity({ sessionId, userId = null, joinIdentity = null }) {
  const sid = Number(sessionId || 0);
  const uid = Number(userId || 0) || null;
  const identity = String(joinIdentity || (uid ? `user-${uid}` : '')).trim();
  if (!sid || !identity) return false;
  try {
    await pool.execute(
      `INSERT INTO supervision_session_video_admissions (session_id, user_id, join_identity)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE admitted_at = admitted_at`,
      [sid, uid, identity]
    );
    return true;
  } catch (e) {
    // Pre-migration fallback: user_id only
    if (uid) {
      try {
        await pool.execute(
          'INSERT IGNORE INTO supervision_session_video_admissions (session_id, user_id) VALUES (?, ?)',
          [sid, uid]
        );
        return true;
      } catch {
        return false;
      }
    }
    console.warn('[supervision] admit failed', e?.message || e);
    return false;
  }
}

async function listWaitingLobbyPresence(sessionId) {
  const sid = Number(sessionId || 0);
  if (!sid) return [];
  await pruneStaleJoinPresence(sid);
  // Looser than attendance stale so brief heartbeat jitter doesn’t hide waiters.
  const lobbyStaleSeconds = Math.max(JOIN_PRESENCE_STALE_SECONDS, 45);
  // Avoid string collation mixes (0900_ai_ci vs unicode_ci): match by user_id when
  // possible, otherwise BINARY compare join_identity (no collation coercion).
  const [rows] = await pool.execute(
    `SELECT p.join_identity, p.display_name, p.is_guest, p.joined_at, p.last_seen_at,
            u.first_name, u.last_name, u.email
     FROM supervision_session_join_presence p
     LEFT JOIN users u
       ON p.join_identity LIKE 'user-%'
      AND u.id = CAST(SUBSTRING(p.join_identity, 6) AS UNSIGNED)
     WHERE p.session_id = ?
       AND p.left_at IS NULL
       AND p.last_seen_at >= (UTC_TIMESTAMP() - INTERVAL ${lobbyStaleSeconds} SECOND)
       AND NOT EXISTS (
         SELECT 1 FROM supervision_session_video_admissions a
         WHERE a.session_id = p.session_id
           AND (
             (
               a.user_id IS NOT NULL
               AND p.join_identity LIKE 'user-%'
               AND a.user_id = CAST(SUBSTRING(p.join_identity, 6) AS UNSIGNED)
             )
             OR (
               a.join_identity IS NOT NULL
               AND a.join_identity <> ''
               AND BINARY a.join_identity = BINARY p.join_identity
             )
           )
       )
     ORDER BY p.joined_at ASC`,
    [sid]
  );
  return (rows || []).map((r) => {
    const identity = String(r.join_identity || '');
    const m = identity.match(/^user-(\d+)$/);
    const fromUser = [r.first_name, r.last_name].filter(Boolean).join(' ').trim()
      || String(r.email || '').trim();
    return {
      identity,
      joinIdentity: identity,
      userId: m ? Number(m[1]) : null,
      displayName: String(r.display_name || '').trim() || fromUser || identity,
      isGuest: !!r.is_guest,
      sid: identity
    };
  });
}

async function buildWaitingRoomPrepPayload(sessionId, { sessionTitle = null } = {}) {
  const sid = Number(sessionId || 0);
  const out = {
    sessionTitle: sessionTitle || null,
    goals: [],
    agenda: []
  };
  if (!sid) return out;
  try {
    const artifact = await SupervisionSessionArtifact.findBySessionId(sid);
    const parseList = (raw) => {
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw || '[]');
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };
    const goals = parseList(artifact?.goals_json ?? artifact?.goals);
    out.goals = goals
      .map((g, idx) => ({
        id: String(g?.id || `g-${idx + 1}`),
        text: String(g?.text || '').trim()
      }))
      .filter((g) => g.text);
    if (!out.sessionTitle && (artifact?.focus_title || artifact?.focusTitle)) {
      out.sessionTitle = String(artifact.focus_title || artifact.focusTitle || '').trim() || null;
    }
  } catch { /* ignore */ }
  try {
    const [agendaRows] = await pool.execute(
      `SELECT mai.id, mai.title, mai.status
       FROM meeting_agendas ma
       INNER JOIN meeting_agenda_items mai ON mai.meeting_agenda_id = ma.id
       WHERE ma.meeting_type = 'supervision_session'
         AND ma.meeting_id = ?
       ORDER BY mai.sort_order ASC, mai.id ASC
       LIMIT 20`,
      [sid]
    );
    out.agenda = (agendaRows || [])
      .map((r) => ({
        id: String(r.id),
        text: String(r.title || '').trim(),
        status: String(r.status || '').trim().toLowerCase() || 'pending'
      }))
      .filter((r) => r.text);
  } catch { /* ignore */ }
  return out;
}

function requireValid(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    return false;
  }
  return true;
}

function isTruthyFlag(v) {
  return v === true || v === 1 || v === '1';
}

/** Actor must have supervisor privileges and group_supervision_eligible to manage group sessions. */
async function assertCanManageGroupSupervision(req, res, { sessionType, existingSessionType } = {}) {
  const nextType = String(sessionType || existingSessionType || '').trim().toLowerCase();
  const involvesGroup = nextType === 'group' || String(existingSessionType || '').trim().toLowerCase() === 'group';
  if (!involvesGroup) return true;

  const actorId = Number(req.user?.id || 0);
  if (!actorId) {
    res.status(401).json({ error: { message: 'Not authenticated' } });
    return false;
  }

  const role = String(req.user?.role || '').toLowerCase();
  if (['admin', 'super_admin', 'support', 'clinical_practice_assistant'].includes(role)) {
    return true;
  }

  let actor = req.user;
  if (actor?.group_supervision_eligible === undefined && actor?.groupSupervisionEligible === undefined) {
    actor = await User.findById(actorId);
  }
  const eligible = isTruthyFlag(actor?.group_supervision_eligible) || isTruthyFlag(actor?.groupSupervisionEligible);
  const privileged = isTruthyFlag(actor?.has_supervisor_privileges)
    || isTruthyFlag(actor?.hasSupervisorPrivileges)
    || String(actor?.role || '').toLowerCase() === 'supervisor'
    || await isSupervisorActor({ userId: actorId, role: actor?.role || req.user?.role, user: actor });

  if (!privileged || !eligible) {
    res.status(403).json({
      error: { message: 'Only admins, CPAs, support, or group-supervision-eligible supervisors can book or edit group supervision sessions' }
    });
    return false;
  }
  return true;
}

/** Preserve wall digits from datetime-local payloads (no TZ convert). */
function parseDateTimeLocalString(s) {
  return normalizeWallMysqlDatetime(s);
}

/** Wall start + IANA TZ → UTC MySQL for storage. */
function wallStartEndToUtcMysql(startWall, endWall, timeZone) {
  const tz = String(timeZone || DEFAULT_SCHEDULE_TZ).trim() || DEFAULT_SCHEDULE_TZ;
  const startAt = wallMysqlToUtcMysql(startWall, tz);
  const endAt = wallMysqlToUtcMysql(endWall, tz);
  return { startAt, endAt, timeZone: tz };
}

/** Signup closes 1 hour before session start (UTC instant math). */
function signupClosesAtFromUtcStart(startAtUtc) {
  return subtractHoursFromUtcMysql(startAtUtc, 1);
}

function isSignupOnlyEnrollment(raw) {
  return String(raw || '').trim().toLowerCase() === 'signup_only';
}

async function buildSupervisionSessionTitle(sessionId, row) {
  if (!sessionId || !row) return null;
  const [nameRows] = await pool.execute(
    `SELECT
       CONCAT(COALESCE(sup.first_name,''), ' ', COALESCE(sup.last_name,'')) AS supervisor_name,
       CONCAT(COALESCE(sv.first_name,''), ' ', COALESCE(sv.last_name,'')) AS supervisee_name,
       ss.session_type
     FROM supervision_sessions ss
     JOIN users sup ON sup.id = ss.supervisor_user_id
     LEFT JOIN users sv ON sv.id = ss.supervisee_user_id
     WHERE ss.id = ?
     LIMIT 1`,
    [sessionId]
  );
  const nr = nameRows?.[0];
  if (!nr) return null;
  const supName = String(nr.supervisor_name || '').trim();
  const svName = String(nr.supervisee_name || '').trim();
  const st = String(nr.session_type || 'individual').toLowerCase();
  const typeLabel = st === 'group' ? 'Group' : st === 'triadic' ? 'Triadic' : 'Individual';
  const names = [supName, svName].filter(Boolean);
  if (st === 'group') {
    // Keep the live title short — listing every invitee is noisy for large groups.
    // Only append assigned Case Conceptualization presenters when set.
    try {
      const presenters = await SupervisionSession.listPresentersForSession(sessionId);
      const presenterNames = (presenters || [])
        .map((p) => String(p?.presenter_name || '').trim())
        .filter(Boolean);
      if (presenterNames.length === 1) {
        return `Group Supervision — Presenting: ${presenterNames[0]}`;
      }
      if (presenterNames.length > 1) {
        return `Group Supervision — Presenting: ${presenterNames.join(' · ')}`;
      }
    } catch {
      /* ignore */
    }
    return 'Group Supervision';
  }
  return names.length ? `${typeLabel} Supervision with ${names.join(' and ')}` : `${typeLabel} Supervision`;
}

async function requireUsersInAgency({ agencyId, supervisorUserId, superviseeUserId }) {
  const supAgencies = await User.getAgencies(supervisorUserId);
  const svAgencies = await User.getAgencies(superviseeUserId);
  const aId = Number(agencyId);
  const supOk = (supAgencies || []).some((a) => Number(a?.id) === aId);
  const svOk = (svAgencies || []).some((a) => Number(a?.id) === aId);
  return { supOk, svOk };
}

async function getUsersInAgencyMap({ agencyId, userIds = [] }) {
  const aId = Number(agencyId);
  const ids = Array.from(new Set((userIds || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)));
  const out = {};
  if (!ids.length) return out;
  await Promise.all(ids.map(async (uid) => {
    const agencies = await User.getAgencies(uid);
    out[uid] = (agencies || []).some((a) => Number(a?.id) === aId);
  }));
  return out;
}

function normalizeInviteScope(raw) {
  const scope = String(raw || 'invited_only').trim().toLowerCase();
  if (scope === 'open_to_all' || scope === 'open_and_invited') return scope;
  return 'invited_only';
}

function deriveInviteScope({ audienceAllSupervised = false, audienceGroupSupport = false, hasNamedInvites = false }) {
  const hasOpen = isTruthyFlag(audienceAllSupervised) || isTruthyFlag(audienceGroupSupport);
  if (!hasOpen) return 'invited_only';
  return hasNamedInvites ? 'open_and_invited' : 'open_to_all';
}

const ACTIVE_SUPERVISION_USER_SQL = `
  AND (u.is_active IS NULL OR u.is_active = TRUE)
  AND (u.is_archived IS NULL OR u.is_archived = FALSE)
  AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED', 'PROSPECTIVE'))
  AND LOWER(COALESCE(u.role, '')) NOT IN ('guardian', 'school_support')
`;

async function getAgencySupervisionAudienceFlags({ agencyId, userId }) {
  const aId = Number(agencyId || 0);
  const uid = Number(userId || 0);
  if (!aId || !uid) return null;
  const [rows] = await pool.execute(
    `SELECT supervision_is_prelicensed, supervision_start_group_hours
     FROM user_agencies
     WHERE agency_id = ? AND user_id = ?
     LIMIT 1`,
    [aId, uid]
  );
  return rows?.[0] || null;
}

async function userMatchesSupervisionOpenAudience({ sessionRow, userId }) {
  const agencyId = Number(sessionRow?.agency_id || 0);
  const uid = Number(userId || 0);
  if (!agencyId || !uid) return false;

  const audienceAllSupervised = isTruthyFlag(sessionRow?.invite_audience_all_supervised);
  const audienceGroupSupport = isTruthyFlag(sessionRow?.invite_audience_group_support);
  const legacyScope = normalizeInviteScope(sessionRow?.invite_scope);

  if (!audienceAllSupervised && !audienceGroupSupport) {
    if (legacyScope === 'open_to_all' || legacyScope === 'open_and_invited') {
      return isAssignedSuperviseeInAgency({
        supervisorUserId: sessionRow?.supervisor_user_id,
        superviseeUserId: uid,
        agencyId
      });
    }
    return false;
  }

  const ua = await getAgencySupervisionAudienceFlags({ agencyId, userId: uid });
  if (!ua) return false;
  const isPrelicensed = isTruthyFlag(ua.supervision_is_prelicensed);
  const needsGroupHours = Number(ua.supervision_start_group_hours || 0) > 0;
  if (audienceAllSupervised && isPrelicensed) return true;
  if (audienceGroupSupport && isPrelicensed && needsGroupHours) return true;
  return false;
}

async function isAssignedSuperviseeInAgency({ supervisorUserId, superviseeUserId, agencyId }) {
  const supId = Number(supervisorUserId || 0);
  const svId = Number(superviseeUserId || 0);
  const aId = Number(agencyId || 0);
  if (!supId || !svId || !aId) return false;
  const assigned = await SupervisorAssignment.findBySupervisor(supId, aId);
  return (assigned || []).some((row) => Number(row?.supervisee_id) === svId);
}

async function canFacilitateSupervisionRow(req, row) {
  const actorId = Number(req.user?.id || 0);
  if (!actorId || !row) return false;
  if (actorId === Number(row.supervisor_user_id || 0)) return true;
  if (actorId === Number(row.co_facilitator_user_id || 0)) return true;
  const sid = Number(row.id || 0);
  if (sid) {
    try {
      const [presenter] = await pool.execute(
        `SELECT 1 FROM supervision_session_presenters WHERE session_id = ? AND user_id = ? LIMIT 1`,
        [sid, actorId]
      );
      if (presenter?.length) return true;
    } catch {
      /* optional table */
    }
  }
  const role = String(req.user?.role || '').toLowerCase();
  if (['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(role)) {
    const actorAgencies = await User.getAgencies(actorId);
    return (actorAgencies || []).some((a) => Number(a?.id) === Number(row.agency_id || 0));
  }
  return false;
}

async function canScheduleSession(req, { agencyId, supervisorUserId, superviseeUserId, sessionId = null }) {
  const role = String(req.user?.role || '').toLowerCase();
  const actorId = Number(req.user?.id || 0);
  const aId = Number(agencyId);

  if (role === 'super_admin' || role === 'admin' || role === 'support' || role === 'staff' || role === 'clinical_practice_assistant' || role === 'provider_plus') {
    // Must share agency with both (best-effort)
    const actorAgencies = await User.getAgencies(actorId);
    const hasAccess = (actorAgencies || []).some((a) => Number(a?.id) === aId);
    return hasAccess;
  }

  // Provider/school staff etc: allow if actor is one of the participants and belongs to this agency.
  if (actorId === Number(superviseeUserId) || actorId === Number(supervisorUserId)) {
    const actorAgencies = await User.getAgencies(actorId);
    return (actorAgencies || []).some((a) => Number(a?.id) === aId);
  }

  // Group/triadic additional attendees (and presenters) may join/view the session.
  const sid = Number(sessionId || 0);
  if (sid && actorId) {
    try {
      const sessionRow = await SupervisionSession.findById(sid);
      if (actorId === Number(sessionRow?.co_facilitator_user_id || 0)) {
        const actorAgencies = await User.getAgencies(actorId);
        return (actorAgencies || []).some((a) => Number(a?.id) === aId);
      }
      const [attendee] = await pool.execute(
        `SELECT 1 FROM supervision_session_attendees WHERE session_id = ? AND user_id = ? LIMIT 1`,
        [sid, actorId]
      );
      if (attendee?.length) {
        const actorAgencies = await User.getAgencies(actorId);
        return (actorAgencies || []).some((a) => Number(a?.id) === aId);
      }
      const [presenter] = await pool.execute(
        `SELECT 1 FROM supervision_session_presenters WHERE session_id = ? AND user_id = ? LIMIT 1`,
        [sid, actorId]
      );
      if (presenter?.length) {
        const actorAgencies = await User.getAgencies(actorId);
        return (actorAgencies || []).some((a) => Number(a?.id) === aId);
      }
      const canOpenJoin = await userMatchesSupervisionOpenAudience({ sessionRow, userId: actorId });
      if (canOpenJoin) {
        const actorAgencies = await User.getAgencies(actorId);
        return (actorAgencies || []).some((a) => Number(a?.id) === Number(sessionRow?.agency_id));
      }
    } catch {
      // ignore schema gaps
    }
  }
  return false;
}

function canViewAgencySupervisionLogs(roleRaw) {
  const role = String(roleRaw || '').toLowerCase();
  return ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant'].includes(role);
}

function supervisionServiceCodesForParticipant({ participantRole, sessionType }) {
  const role = String(participantRole || '').trim().toLowerCase();
  const st = String(sessionType || 'individual').trim().toLowerCase();
  if (role === 'supervisor') {
    if (st === 'group') return ['99416', '99415'];
    return ['99415'];
  }
  // Supervisees are paid via literal MEETING after 100h (99414 tracks requirements only).
  return ['MEETING'];
}

function isSupervisionMeetingCode(codeRaw) {
  const code = String(codeRaw || '').trim().toUpperCase();
  return code === '99414' || code === '99415' || code === '99416' || code === 'MEETING';
}

function mysqlNowDateTime() {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
}

function csvCell(value) {
  const raw = value == null ? '' : String(value);
  if (!raw.includes('"') && !raw.includes(',') && !raw.includes('\n')) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

function canViewSessionArtifacts(roleRaw) {
  const role = String(roleRaw || '').toLowerCase();
  return [
    'super_admin',
    'admin',
    'support',
    'staff',
    'clinical_practice_assistant',
    'provider',
    'provider_plus',
    'supervisor',
    'supervisee'
  ].includes(role);
}

/**
 * Transcript visibility: agency admins/staff, plus supervisors/supervisees on the session
 * (provider / provider_plus roles who participate via canScheduleSession).
 */
function canViewTranscript(roleRaw) {
  const role = String(roleRaw || '').toLowerCase();
  return [
    'super_admin',
    'admin',
    'support',
    'staff',
    'clinical_practice_assistant',
    'provider',
    'provider_plus',
    'supervisor',
    'supervisee'
  ].includes(role);
}

function buildSupervisionSummaryPrompt(transcriptText) {
  const cleaned = String(transcriptText || '').trim().slice(0, 15000);
  return [
    'You are generating a supervision meeting summary for internal documentation.',
    'Cover every topic discussed in the transcript (and any agenda/goals mentioned). Do not omit substantive threads.',
    'Return concise markdown with these sections only:',
    '- Key updates',
    '- Clinical/operational decisions',
    '- Suggested action items by person',
    '- Risks/follow-ups',
    '',
    'Rules:',
    '- Be factual, no invented details.',
    '- Keep each section to 2-8 bullets as needed to cover all topics.',
    '- In "Suggested action items by person", format bullets as "Name: action 1; action 2".',
    '- Attribute ownership when speakers say phrases like "remind me", "add to my list", "I\'ll take", "I can own", "put that on my list", or similar — assign that item to the speaker (use their labeled name from the transcript when present).',
    '- If a person is not named but the speaker clearly volunteers, use their speaker label.',
    '- If information is missing, state "Not discussed".',
    '',
    'Transcript:',
    cleaned
  ].join('\n');
}

function wallMysqlFromMs(ms) {
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const p2 = (n) => String(n).padStart(2, '0');
  // Keep wall-clock local components (same convention as mysqlNowDateTime / session start_at).
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

/**
 * Parse MySQL DATETIME / ISO as wall-clock local time (no UTC shift).
 * Session times are stored without timezone.
 */
function parseAsDate(input) {
  if (input instanceof Date && !Number.isNaN(input.getTime())) return input;
  const raw = String(input || '').trim();
  if (!raw) return null;
  // Naked DATETIME digits are UTC under the schedule contract.
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw);
  if (m && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const d = new Date(Date.UTC(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6] || 0)
    ));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function recomputeAttendanceRollupForUser({
  sessionId,
  userId,
  closeOpenAt = null,
  forceFinalize = false,
  sessionStartAt = null
} = {}) {
  const sid = Number(sessionId || 0);
  const uid = Number(userId || 0);
  if (!sid || !uid) return null;

  const events = await SupervisionSession.listAttendanceEventsForSessionUser({ sessionId: sid, userId: uid });
  const openedStack = [];
  let firstJoinedAt = null;
  let lastLeftAt = null;
  let totalSeconds = 0;
  let segmentCount = 0;
  const nowMs = Date.now();
  const closeCapMs = closeOpenAt ? parseAsDate(closeOpenAt)?.getTime() : null;
  // Payable / supervision time only accrues at or after the scheduled session start.
  const sessionStartMs = parseAsDate(sessionStartAt)?.getTime();

  function creditSegment(rawOpenMs, rawEndMs) {
    if (!Number.isFinite(rawOpenMs) || !Number.isFinite(rawEndMs)) return;
    let openMs = rawOpenMs;
    if (Number.isFinite(sessionStartMs)) openMs = Math.max(openMs, sessionStartMs);
    if (rawEndMs <= openMs) return;
    totalSeconds += Math.round((rawEndMs - openMs) / 1000);
    segmentCount += 1;
    if (!lastLeftAt || rawEndMs > lastLeftAt.getTime()) lastLeftAt = new Date(rawEndMs);
  }

  for (const ev of events || []) {
    const evType = String(ev?.event_type || '').trim().toLowerCase();
    const atMs = parseAsDate(ev?.event_at)?.getTime();
    if (!Number.isFinite(atMs)) continue;
    if (evType === 'joined' || evType === 'opened') {
      // Duplicate open/joined (e.g. mounted "opened" + connected "joined") used to leave
      // unmatched opens that ballooned hours until finalize. Auto-close prior open first.
      if (openedStack.length) {
        const prevOpenMs = openedStack.pop();
        creditSegment(prevOpenMs, atMs);
      }
      openedStack.push(atMs);
      if (!firstJoinedAt || atMs < firstJoinedAt.getTime()) firstJoinedAt = new Date(atMs);
      continue;
    }
    if ((evType === 'left' || evType === 'closed') && openedStack.length) {
      const openedAtMs = openedStack.pop();
      creditSegment(openedAtMs, atMs);
    }
  }

  // Close leftover opens at session end (finalize) or cap provisional time at session end / now.
  for (const openedAtMs of openedStack) {
    const endMs = Number.isFinite(closeCapMs)
      ? Math.min(nowMs, closeCapMs)
      : nowMs;
    creditSegment(openedAtMs, endMs);
  }
  if (forceFinalize) openedStack.length = 0;

  // Hard sanity cap: never credit more than 8h for a single session attendance row.
  const MAX_SESSION_SECONDS = 8 * 3600;
  if (totalSeconds > MAX_SESSION_SECONDS) totalSeconds = MAX_SESSION_SECONDS;

  await SupervisionSession.upsertAttendanceRollup({
    sessionId: sid,
    userId: uid,
    firstJoinedAt: firstJoinedAt ? wallMysqlFromMs(firstJoinedAt.getTime()) : null,
    lastLeftAt: lastLeftAt ? wallMysqlFromMs(lastLeftAt.getTime()) : null,
    totalSeconds,
    segmentCount,
    isFinalized: forceFinalize || openedStack.length === 0
  });
  return {
    sessionId: sid,
    userId: uid,
    firstJoinedAt: firstJoinedAt ? wallMysqlFromMs(firstJoinedAt.getTime()) : null,
    lastLeftAt: lastLeftAt ? wallMysqlFromMs(lastLeftAt.getTime()) : null,
    totalSeconds,
    segmentCount,
    isFinalized: forceFinalize || openedStack.length === 0
  };
}

async function finalizeSupervisionSession({
  sessionId,
  actorUserId = null,
  source = 'manual_submit',
  forceMissed = false
}) {
  const sid = Number(sessionId || 0);
  if (!sid) return null;
  const row = await SupervisionSession.findById(sid);
  if (!row) return null;
  const status = String(row.status || '').trim().toUpperCase();
  if (status === 'CANCELLED' || status === 'RESCHEDULED') {
    return { skipped: true, reason: 'not_finalizable', session: row };
  }
  if (status === 'FINALIZED' || status === 'MISSED') {
    return { skipped: true, reason: 'already_finalized', session: row };
  }

  // Recompute each participant before finalize so open/unpaired joins do not
  // count from join-time until finalize-time (that produced absurd multi-day hours).
  const closeOpenAt = row.end_at || mysqlNowDateTime();
  let priorRollups = [];
  try {
    priorRollups = await SupervisionSession.listAttendanceRollupsForSession(sid);
  } catch {
    priorRollups = [];
  }
  const userIds = new Set(
    (priorRollups || []).map((r) => Number(r.user_id || 0)).filter((n) => n > 0)
  );
  try {
    const attendees = await SupervisionSession.listAttendees(sid);
    for (const a of attendees || []) {
      const uid = Number(a?.user_id || 0);
      if (uid > 0) userIds.add(uid);
    }
  } catch {
    /* ignore */
  }
  const supervisorId = Number(row.supervisor_user_id || 0);
  const superviseeId = Number(row.supervisee_user_id || 0);
  if (supervisorId > 0) userIds.add(supervisorId);
  if (superviseeId > 0) userIds.add(superviseeId);

  for (const uid of userIds) {
    // eslint-disable-next-line no-await-in-loop
    await recomputeAttendanceRollupForUser({
      sessionId: sid,
      userId: uid,
      closeOpenAt,
      forceFinalize: true,
      sessionStartAt: row.start_at
    });
  }

  const rollups = await SupervisionSession.listAttendanceRollupsForSession(sid);
  const totalSeconds = (rollups || []).reduce((sum, r) => sum + Number(r?.total_seconds || 0), 0);
  const hasAttendanceData = totalSeconds > 0;

  const artifact = await SupervisionSessionArtifact.findBySessionId(sid);
  const hasTranscriptData =
    !!String(artifact?.transcript_text || '').trim() ||
    !!String(artifact?.transcript_url || '').trim() ||
    !!String(artifact?.summary_text || '').trim();

  const finalizeAsMissed = forceMissed || (!hasAttendanceData && !hasTranscriptData);
  const finalizedAt = mysqlNowDateTime();
  const normalizedSource = String(source || 'manual_submit').trim().toLowerCase();

  const conn = await pool.getConnection();
  let updated = null;
  try {
    await conn.beginTransaction();
    const [lockedRows] = await conn.execute(
      `SELECT id, status
       FROM supervision_sessions
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [sid]
    );
    const lockedStatus = String(lockedRows?.[0]?.status || '').trim().toUpperCase();
    if (lockedStatus === 'FINALIZED' || lockedStatus === 'MISSED') {
      await conn.rollback();
      return { skipped: true, reason: 'already_finalized', session: row };
    }
    if (lockedStatus === 'CANCELLED' || lockedStatus === 'RESCHEDULED') {
      await conn.rollback();
      return { skipped: true, reason: 'not_finalizable', session: row };
    }

    await SupervisionSession.markAttendanceRollupsFinalized(sid, true);
    const nextStatus = finalizeAsMissed ? 'MISSED' : 'FINALIZED';
    await conn.execute(
      `UPDATE supervision_sessions
       SET status = ?,
           finalized_at = ?,
           finalized_by_user_id = ?,
           finalize_source = ?,
           final_total_seconds = ?,
           superseded_by_session_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
       LIMIT 1`,
      [
        nextStatus,
        finalizedAt,
        actorUserId ? Number(actorUserId) : null,
        normalizedSource,
        finalizeAsMissed ? 0 : totalSeconds,
        sid
      ]
    );
    await conn.commit();
    updated = await SupervisionSession.findById(sid);
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw e;
  } finally {
    conn.release();
  }

  let pipeline = null;
  if (!finalizeAsMissed) {
    try {
      const { runSupervisionFinalizeSideEffects } = await import('../services/supervisionFinalizePipeline.service.js');
      pipeline = await runSupervisionFinalizeSideEffects({
        session: updated || row,
        rollups,
        actorUserId,
        finalizeAsMissed: false
      });
      if (pipeline?.claim?.skipped || pipeline?.claim?.ok === false) {
        console.warn(
          `[supervision] finalize claim result session=${sid}:`,
          pipeline?.claim?.reason || pipeline?.claim?.error || pipeline?.claim
        );
      }
    } catch (e) {
      console.warn('[supervision] finalize pipeline failed', e?.message || e);
      pipeline = { ok: false, error: e?.message || 'pipeline_failed' };
    }
  } else {
    console.warn(
      `[supervision] finalize marked MISSED session=${sid} (no attendance/transcript); payroll claim skipped`
    );
  }

  let carryover = null;
  if (!finalizeAsMissed) {
    try {
      const { carryForwardSupervisionWorkspace } = await import('../services/meetingWorkspaceCarryover.service.js');
      carryover = await carryForwardSupervisionWorkspace({ sessionId: sid, actorUserId });
    } catch (e) {
      console.warn('[supervision] finalize workspace carryover failed', e?.message || e);
    }
  }

  return {
    skipped: false,
    status: finalizeAsMissed ? 'MISSED' : 'FINALIZED',
    finalTotalSeconds: finalizeAsMissed ? 0 : totalSeconds,
    session: updated,
    pipeline,
    carryover
  };
}

async function autoFinalizeOverdueSessions({ agencyId = null, actorUserId = null } = {}) {
  const where = [
    `UPPER(COALESCE(ss.status, 'SCHEDULED')) IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED_PENDING_FINALIZE')`,
    'ss.end_at <= DATE_SUB(NOW(), INTERVAL 15 MINUTE)'
  ];
  const params = [];
  if (Number(agencyId) > 0) {
    where.push('ss.agency_id = ?');
    params.push(Number(agencyId));
  }
  const [rows] = await pool.execute(
    `SELECT ss.id
     FROM supervision_sessions ss
     WHERE ${where.join(' AND ')}
     ORDER BY ss.end_at ASC
     LIMIT 200`,
    params
  );
  const finalized = [];
  for (const r of rows || []) {
    // eslint-disable-next-line no-await-in-loop
    const out = await finalizeSupervisionSession({
      sessionId: Number(r.id || 0),
      actorUserId,
      source: 'auto_plus_15',
      forceMissed: false
    });
    if (!out?.skipped) finalized.push(out);
  }
  return finalized;
}

async function maybeReopenAutoFinalizedSessionForJoin(row) {
  if (!row?.id) return row;
  const status = String(row.status || '').trim().toUpperCase();
  const finalizeSource = String(row.finalize_source || '').trim().toLowerCase();
  if (!['FINALIZED', 'MISSED'].includes(status) || finalizeSource !== 'auto_plus_15') {
    return row;
  }
  try {
    const { reverseSupervisionFinalizeSideEffects } = await import('../services/supervisionFinalizePipeline.service.js');
    await reverseSupervisionFinalizeSideEffects({ session: row });
  } catch (e) {
    console.warn('[supervision] reverse finalize side effects failed', e?.message || e);
  }
  await SupervisionSession.setStatus(row.id, 'IN_PROGRESS', {
    finalizedAt: null,
    finalizedByUserId: null,
    finalizeSource: null,
    finalTotalSeconds: null,
    supersededBySessionId: null
  });
  await SupervisionSession.markAttendanceRollupsFinalized(row.id, false);
  return SupervisionSession.findById(row.id);
}

async function getSupervisionPayEligibility({ agencyId, userId }) {
  const uid = Number(userId || 0);
  const aId = Number(agencyId || 0);
  if (!uid || !aId) {
    return {
      eligible: false,
      isHourlyWorker: false,
      individualHours: 0,
      groupHours: 0,
      totalSupervisionHours: 0
    };
  }

  const u = await User.findById(uid);
  const isHourlyWorker = !!(u?.is_hourly_worker === 1 || u?.is_hourly_worker === true || u?.is_hourly_worker === '1');

  let individualHours = 0;
  let groupHours = 0;
  try {
    const [rows] = await pool.execute(
      `SELECT COALESCE(individual_hours, 0) AS ind, COALESCE(group_hours, 0) AS grp
       FROM supervision_accounts
       WHERE agency_id = ? AND user_id = ?
       LIMIT 1`,
      [aId, uid]
    );
    individualHours = Number(rows?.[0]?.ind || 0);
    groupHours = Number(rows?.[0]?.grp || 0);
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
  }

  const totalSupervisionHours = individualHours + groupHours;
  // Align with payroll: ≥50 individual and ≥100 total (hourly flag no longer bypasses).
  const eligible = isSupervisionPayEligibleHours({ individualHours, groupHours });
  return { eligible, isHourlyWorker, individualHours, groupHours, totalSupervisionHours };
}

async function resolveSupervisionPayForParticipant({
  agencyId,
  userId,
  participantRole,
  sessionType,
  asOfDate
}) {
  const uid = Number(userId || 0);
  const aId = Number(agencyId || 0);
  if (!uid || !aId) {
    return {
      serviceCode: null,
      serviceCodes: [],
      rateBreakdown: [],
      rateAmountTotalPerHour: 0,
      rateUnit: 'per_hour',
      rateSource: 'none',
      payable: false,
      reason: 'missing_ids'
    };
  }

  const serviceCodes = supervisionServiceCodesForParticipant({ participantRole, sessionType });
  const serviceCode = serviceCodes[0] || null;
  const asOf = String(asOfDate || '').slice(0, 10) || null;
  const rateCard = await PayrollRateCard.findForUser(aId, uid);

  if (String(participantRole || '').toLowerCase() === 'supervisor') {
    const rateBreakdown = [];
    for (const code of serviceCodes) {
      // eslint-disable-next-line no-await-in-loop
      const perCodeRate = await PayrollRate.findBestRate({
        agencyId: aId,
        userId: uid,
        serviceCode: code,
        asOf
      });
      if (perCodeRate) {
        rateBreakdown.push({
          serviceCode: code,
          rateAmount: Number(perCodeRate.rate_amount || 0),
          rateUnit: isSupervisionMeetingCode(code)
            ? 'per_hour'
            : (String(perCodeRate.rate_unit || 'per_hour').trim().toLowerCase() || 'per_hour'),
          rateSource: 'per_code_rate',
          payable: true,
          reason: null
        });
      } else {
        rateBreakdown.push({
          serviceCode: code,
          rateAmount: Number(rateCard?.indirect_rate || 0),
          rateUnit: 'per_hour',
          rateSource: rateCard ? 'indirect_rate_fallback' : 'none',
          payable: true,
          reason: rateCard ? 'missing_supervision_rate_used_indirect' : 'missing_supervision_rate'
        });
      }
    }
    const rateAmountTotalPerHour = rateBreakdown.reduce((sum, r) => sum + Number(r.rateAmount || 0), 0);
    return {
      serviceCode,
      serviceCodes,
      rateBreakdown,
      rateAmountTotalPerHour,
      rateUnit: 'per_hour',
      rateSource: rateBreakdown.every((r) => r.rateSource === 'per_code_rate') ? 'per_code_rate' : 'mixed',
      payable: true,
      reason: rateBreakdown.find((r) => r.reason)?.reason || null
    };
  }

  const eligibility = await getSupervisionPayEligibility({ agencyId: aId, userId: uid });
  if (!eligibility.eligible) {
    return {
      serviceCode,
      serviceCodes,
      rateBreakdown: serviceCodes.map((code) => ({
        serviceCode: code,
        rateAmount: 0,
        rateUnit: 'per_hour',
        rateSource: 'none',
        payable: false,
        reason: 'requires_100_supervision_hours'
      })),
      rateAmountTotalPerHour: 0,
      rateUnit: 'per_hour',
      rateSource: 'none',
      payable: false,
      reason: 'requires_100_supervision_hours',
      eligibility
    };
  }

  // Check effective start date (sessions before this date are logged but not payable).
  let effectiveStartDate = null;
  try {
    const [uaRows] = await pool.execute(
      `SELECT supervision_start_date FROM user_agencies
       WHERE agency_id = ? AND user_id = ? LIMIT 1`,
      [aId, uid]
    );
    effectiveStartDate = normalizeSupervisionStartDateYmd(uaRows?.[0]?.supervision_start_date);
  } catch { /* ignore */ }
  if (asOf && effectiveStartDate && asOf < effectiveStartDate) {
    return {
      serviceCode,
      serviceCodes,
      rateBreakdown: serviceCodes.map((code) => ({
        serviceCode: code,
        rateAmount: 0,
        rateUnit: 'per_hour',
        rateSource: 'none',
        payable: false,
        reason: 'before_effective_start_date'
      })),
      rateAmountTotalPerHour: 0,
      rateUnit: 'per_hour',
      rateSource: 'none',
      payable: false,
      reason: 'before_effective_start_date',
      eligibility,
      effectiveStartDate
    };
  }
  if (!effectiveStartDate) {
    return {
      serviceCode,
      serviceCodes,
      rateBreakdown: serviceCodes.map((code) => ({
        serviceCode: code,
        rateAmount: 0,
        rateUnit: 'per_hour',
        rateSource: 'none',
        payable: false,
        reason: 'missing_effective_start_date'
      })),
      rateAmountTotalPerHour: 0,
      rateUnit: 'per_hour',
      rateSource: 'none',
      payable: false,
      reason: 'missing_effective_start_date',
      eligibility
    };
  }

  const rateBreakdown = [];
  for (const code of serviceCodes) {
    // eslint-disable-next-line no-await-in-loop
    const perCodeRate = await PayrollRate.findBestRate({
      agencyId: aId,
      userId: uid,
      serviceCode: code,
      asOf
    });
    if (perCodeRate) {
      rateBreakdown.push({
        serviceCode: code,
        rateAmount: Number(perCodeRate.rate_amount || 0),
        rateUnit: 'per_hour',
        rateSource: 'per_code_rate',
        payable: true,
        reason: null
      });
      continue;
    }
    // Never fall back to indirect for supervisee MEETING pay.
    rateBreakdown.push({
      serviceCode: code,
      rateAmount: 0,
      rateUnit: 'per_hour',
      rateSource: 'none',
      payable: false,
      reason: 'missing_meeting_rate'
    });
  }
  const rateAmountTotalPerHour = rateBreakdown.reduce((sum, r) => sum + Number(r.rateAmount || 0), 0);
  return {
    serviceCode,
    serviceCodes,
    rateBreakdown,
    rateAmountTotalPerHour,
    rateUnit: 'per_hour',
    rateSource: rateBreakdown.every((r) => r.rateSource === 'per_code_rate') ? 'per_code_rate' : 'mixed',
    payable: true,
    reason: rateBreakdown.find((r) => r.reason)?.reason || null,
    eligibility
  };
}

async function buildSupervisorLockedGroups(supervisorUserId, { agencyId, allAgencies = false, agencyIds = [] } = {}) {
  const supId = Number(supervisorUserId || 0);
  if (!supId) return [];
  try {
    if (allAgencies) {
      const scoped = (agencyIds || []).map((n) => Number(n || 0)).filter((n) => n > 0);
      return await SupervisorAssignment.listLockedGroupsForSupervisor(supId, { agencyIds: scoped });
    }
    const aid = Number(agencyId || 0);
    if (!aid) return [];
    return await SupervisorAssignment.listLockedGroupsForSupervisor(supId, { agencyId: aid });
  } catch {
    return [];
  }
}

export const listSupervisionProviderCandidates = async (req, res, next) => {
  try {
    const actorId = Number(req.user?.id || 0);
    const role = String(req.user?.role || '').trim().toLowerCase();
    if (!actorId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    // Supervisors are usually role=provider + has_supervisor_privileges (not role=supervisor).
    const actorIsSupervisor = await isSupervisorActor({ userId: actorId, role, user: req.user });
    const actorIsAdminLike = isAdminLikeRole(role);
    if (!actorIsSupervisor && !actorIsAdminLike) {
      return res.status(403).json({ error: { message: 'Supervision participant selection is limited to supervisors and admins.' } });
    }

    const actorAgencies = await User.getAgencies(actorId);
    const actorAgencyIds = Array.from(
      new Set((actorAgencies || []).map((a) => Number(a?.id)).filter((n) => Number.isFinite(n) && n > 0))
    );
    if (!actorAgencyIds.length) {
      return res.json({ ok: true, agencyId: null, providers: [] });
    }

    const modeRaw = String(req.query?.mode || 'individual').trim().toLowerCase();
    const mode = modeRaw === 'group' ? 'group' : 'individual';
    const allAgencies = String(req.query?.allAgencies || '').trim().toLowerCase() === 'true';
    const audienceRaw = String(req.query?.audience || '').trim().toLowerCase();
    const audience = ['assigned', 'all_supervised', 'group_support'].includes(audienceRaw)
      ? audienceRaw
      : (mode === 'group' ? 'all_supervised' : 'assigned');

    const requestedAgencyId = Number(req.query?.agencyId || 0);
    const agencyId = requestedAgencyId > 0 ? requestedAgencyId : actorAgencyIds[0];
    const supervisorUserId = Number(req.query?.supervisorUserId || 0) || actorId;
    if (!allAgencies && !actorAgencyIds.includes(agencyId)) {
      return res.status(403).json({ error: { message: 'Access denied for this agency' } });
    }
    if (allAgencies && mode !== 'group') {
      return res.status(400).json({ error: { message: 'All-agencies supervision list is only available for group supervision.' } });
    }

    if (mode === 'individual' && audience === 'assigned') {
      const assigned = await SupervisorAssignment.findBySupervisor(actorId, agencyId);
      let providers = [];
      if ((assigned || []).length > 0) {
        const deduped = new Map();
        for (const row of assigned) {
          const id = Number(row?.supervisee_id || 0);
          if (!id || deduped.has(id)) continue;
          deduped.set(id, {
            id,
            firstName: String(row?.supervisee_first_name || '').trim(),
            lastName: String(row?.supervisee_last_name || '').trim(),
            email: String(row?.supervisee_email || '').trim().toLowerCase(),
            role: String(row?.supervisee_role || '').trim().toLowerCase()
          });
        }
        providers = Array.from(deduped.values());
      }
      // Admins without supervisee assignments: show all agency users for session creation.
      // Privilege-based supervisors only see their assigned supervisees (empty if none).
      if (providers.length === 0 && actorIsAdminLike) {
        const [rows] = await pool.execute(
          `SELECT u.id, u.first_name, u.last_name, u.email, u.role
           FROM user_agencies ua
           JOIN users u ON u.id = ua.user_id
           WHERE ua.agency_id = ?
             AND (u.is_active IS NULL OR u.is_active = TRUE)
             AND (u.is_archived IS NULL OR u.is_archived = FALSE)
             AND (u.status IS NULL OR UPPER(u.status) NOT IN ('ARCHIVED', 'PROSPECTIVE'))
             AND LOWER(COALESCE(u.role, '')) NOT IN ('guardian', 'school_support')
           ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
          [agencyId]
        );
        providers = (rows || []).map((r) => ({
          id: Number(r.id),
          firstName: String(r.first_name || '').trim(),
          lastName: String(r.last_name || '').trim(),
          email: String(r.email || '').trim().toLowerCase(),
          role: String(r.role || '').trim().toLowerCase()
        }));
      }
      let facilitators = [];
      try {
        const [facRows] = await pool.execute(
          `SELECT DISTINCT
             u.id, u.first_name, u.last_name, u.email, u.role, u.group_supervision_eligible
           FROM user_agencies ua
           JOIN users u ON u.id = ua.user_id
           WHERE ua.agency_id = ?
             ${ACTIVE_SUPERVISION_USER_SQL}
             AND (
               LOWER(COALESCE(u.role, '')) IN ('super_admin', 'admin', 'support', 'clinical_practice_assistant')
               OR (
                 (u.has_supervisor_privileges = 1 OR LOWER(COALESCE(u.role, '')) = 'supervisor')
                 AND u.group_supervision_eligible = 1
               )
             )
           ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
          [agencyId]
        );
        facilitators = (facRows || []).map((r) => ({
          id: Number(r.id),
          firstName: String(r.first_name || '').trim(),
          lastName: String(r.last_name || '').trim(),
          email: String(r.email || '').trim().toLowerCase(),
          role: String(r.role || '').trim().toLowerCase(),
          groupSupervisionEligible: isTruthyFlag(r.group_supervision_eligible)
        }));
      } catch {
        facilitators = [];
      }
      const supervisorGroups = await buildSupervisorLockedGroups(supervisorUserId, { agencyId });
      return res.json({ ok: true, agencyId, agencyIds: [agencyId], mode, audience, providers, facilitators, supervisorGroups });
    }

    if (mode === 'individual' && audience !== 'assigned') {
      return res.status(400).json({ error: { message: 'Agency-wide supervision audiences are only available for group/triadic scheduling.' } });
    }

    const scopedAgencyIds = allAgencies ? actorAgencyIds : [agencyId];
    const placeholders = scopedAgencyIds.map(() => '?').join(',');
    let audienceSql = 'ua.supervision_is_prelicensed = 1';
    if (audience === 'group_support') {
      audienceSql = 'ua.supervision_is_prelicensed = 1 AND COALESCE(ua.supervision_start_group_hours, 0) > 0';
    }
    const [rows] = await pool.execute(
      `SELECT DISTINCT
         u.id,
         u.first_name,
         u.last_name,
         u.email,
         u.role
       FROM user_agencies ua
       JOIN users u ON u.id = ua.user_id
       WHERE ua.agency_id IN (${placeholders})
         AND ${audienceSql}
         ${ACTIVE_SUPERVISION_USER_SQL}
       ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
      scopedAgencyIds
    );

    const providers = (rows || []).map((r) => ({
      id: Number(r.id),
      firstName: String(r.first_name || '').trim(),
      lastName: String(r.last_name || '').trim(),
      email: String(r.email || '').trim().toLowerCase(),
      role: String(r.role || '').trim().toLowerCase()
    }));

    let facilitators = [];
    try {
      const [facRows] = await pool.execute(
        `SELECT DISTINCT
           u.id,
           u.first_name,
           u.last_name,
           u.email,
           u.role,
           u.has_supervisor_privileges,
           u.group_supervision_eligible
         FROM user_agencies ua
         JOIN users u ON u.id = ua.user_id
         WHERE ua.agency_id IN (${placeholders})
           ${ACTIVE_SUPERVISION_USER_SQL}
           AND (
             LOWER(COALESCE(u.role, '')) IN ('super_admin', 'admin', 'support', 'clinical_practice_assistant')
             OR (
               (u.has_supervisor_privileges = 1 OR LOWER(COALESCE(u.role, '')) = 'supervisor')
               AND u.group_supervision_eligible = 1
             )
           )
         ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
        scopedAgencyIds
      );
      facilitators = (facRows || []).map((r) => ({
        id: Number(r.id),
        firstName: String(r.first_name || '').trim(),
        lastName: String(r.last_name || '').trim(),
        email: String(r.email || '').trim().toLowerCase(),
        role: String(r.role || '').trim().toLowerCase(),
        groupSupervisionEligible: isTruthyFlag(r.group_supervision_eligible)
      }));
    } catch {
      facilitators = [];
    }

    const supervisorGroups = await buildSupervisorLockedGroups(supervisorUserId, {
      agencyId: allAgencies ? null : agencyId,
      allAgencies,
      agencyIds: scopedAgencyIds
    });

    res.json({
      ok: true,
      agencyId: allAgencies ? null : agencyId,
      agencyIds: scopedAgencyIds,
      mode,
      audience,
      providers,
      facilitators,
      supervisorGroups
    });
  } catch (e) {
    next(e);
  }
};

export const markSupervisionMeetingLifecycle = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });
    let row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });
    row = await maybeReopenAutoFinalizedSessionForJoin(row);
    const status = String(row.status || '').trim().toUpperCase();
    if (['CANCELLED', 'RESCHEDULED', 'MISSED', 'FINALIZED'].includes(status)) {
      return res.status(400).json({ error: { message: `Session is ${status.toLowerCase()} and is not joinable.` } });
    }
    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id,
      sessionId: id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const actorUserId = Number(req.user?.id || 0);
    if (!actorUserId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const eventTypeRaw = String(req.body?.eventType || '').trim().toLowerCase();
    if (!['opened', 'closed', 'joined', 'left'].includes(eventTypeRaw)) {
      return res.status(400).json({ error: { message: 'eventType must be opened, closed, joined, or left' } });
    }
    const eventType = (eventTypeRaw === 'opened')
      ? 'joined'
      : (eventTypeRaw === 'closed' ? 'left' : eventTypeRaw);
    // Prefer client ISO/Z; otherwise stamp UTC now (event_at is UTC).
    const eventAtRaw = req.body?.eventAt;
    let eventAt = mysqlNowDateTime();
    if (eventAtRaw != null && String(eventAtRaw).trim()) {
      const asDate = parseAsDate(eventAtRaw);
      if (asDate) {
        const p2 = (n) => String(n).padStart(2, '0');
        eventAt = `${asDate.getUTCFullYear()}-${p2(asDate.getUTCMonth() + 1)}-${p2(asDate.getUTCDate())} ${p2(asDate.getUTCHours())}:${p2(asDate.getUTCMinutes())}:${p2(asDate.getUTCSeconds())}`;
      }
    }
    const clientSessionKey = String(req.body?.clientSessionKey || '').trim()
      || `web-${id}-${actorUserId}-${Date.now()}`;

    let attendee = await SupervisionSession.findAttendeeBySessionUser(id, actorUserId);
    if (!attendee) {
      const role = Number(row.supervisor_user_id) === actorUserId ? 'supervisor' : 'supervisee';
      await SupervisionSession.upsertAttendees(id, [{
        userId: actorUserId,
        participantRole: role,
        isRequired: true,
        isCompensableSnapshot: false,
        status: 'INVITED'
      }]);
      attendee = await SupervisionSession.findAttendeeBySessionUser(id, actorUserId);
    }

    await SupervisionSession.recordAttendanceEvent({
      sessionId: id,
      attendeeId: Number(attendee?.id || 0) || null,
      userId: actorUserId,
      participantSessionKey: clientSessionKey,
      eventType,
      eventAt,
      rawPayload: {
        source: 'web_app_modal',
        eventTypeRaw,
        actorUserId
      }
    });

    await SupervisionSession.setAttendeeStatus({
      sessionId: id,
      userId: actorUserId,
      status: eventType === 'joined' ? 'JOINED' : 'LEFT'
    });

    if (eventType === 'joined') {
      await SupervisionSession.setStatus(id, 'IN_PROGRESS');
    } else if (eventType === 'left') {
      await SupervisionSession.setStatus(id, 'COMPLETED_PENDING_FINALIZE');
    }

    // Ensure each tracked meeting has an artifact shell tied to the session.
    if (eventTypeRaw === 'opened' || eventTypeRaw === 'closed') {
      await SupervisionSessionArtifact.ensureTagged({
        sessionId: id,
        updatedByUserId: actorUserId
      });
    }

    const rollup = await recomputeAttendanceRollupForUser({
      sessionId: id,
      userId: actorUserId,
      sessionStartAt: row.start_at
    });

    // Keep overdue sessions finalized when users revisit supervision flows.
    await autoFinalizeOverdueSessions({ agencyId: Number(row.agency_id || 0), actorUserId });
    res.json({
      ok: true,
      sessionId: id,
      userId: actorUserId,
      eventType,
      eventAt,
      clientSessionKey,
      rollup
    });
  } catch (e) {
    next(e);
  }
};

export const finalizeSupervisionSessionBySubmit = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });
    let row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });
    row = await maybeReopenAutoFinalizedSessionForJoin(row);
    const status = String(row.status || '').trim().toUpperCase();
    if (['CANCELLED', 'RESCHEDULED', 'MISSED', 'FINALIZED'].includes(status)) {
      return res.status(400).json({ error: { message: `Session is ${status.toLowerCase()} and is not joinable.` } });
    }

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const actorUserId = Number(req.user?.id || 0);
    if (!actorUserId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const forceMissed = req.body?.markMissed === true;
    const result = await finalizeSupervisionSession({
      sessionId: id,
      actorUserId,
      source: 'manual_submit',
      forceMissed
    });

    if (result?.reason === 'not_finalizable') {
      return res.status(400).json({ error: { message: 'Session cannot be finalized from its current state.' } });
    }

    res.json({
      ok: true,
      sessionId: id,
      finalized: !result?.skipped,
      status: result?.status || String(result?.session?.status || '').trim().toUpperCase() || null,
      finalTotalSeconds: Number(result?.finalTotalSeconds || result?.session?.final_total_seconds || 0),
      session: result?.session || null
    });
  } catch (e) {
    next(e);
  }
};

/** POST /api/supervision/sessions/:id/end-live — facilitator ends the live video room for everyone. */
export const endSupervisionLiveSession = async (req, res, next) => {
  try {
    const ref = String(req.params.id || '').trim();
    if (!ref) return res.status(400).json({ error: { message: 'Invalid session id' } });
    const row = await SupervisionSession.resolveByJoinRef(ref);
    if (!row?.id) return res.status(404).json({ error: { message: 'Session not found' } });
    const id = Number(row.id);
    const actorUserId = Number(req.user?.id || 0);
    if (!actorUserId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id,
      sessionId: id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const isSupervisor = actorUserId === Number(row.supervisor_user_id || 0)
      || actorUserId === Number(row.co_facilitator_user_id || 0);
    let isPresenter = false;
    try {
      const [presenterRows] = await pool.execute(
        `SELECT 1 FROM supervision_session_presenters WHERE session_id = ? AND user_id = ? LIMIT 1`,
        [id, actorUserId]
      );
      isPresenter = !!(presenterRows?.length);
    } catch {
      isPresenter = false;
    }
    if (!isSupervisor && !isPresenter) {
      return res.status(403).json({ error: { message: 'Only the facilitator can end the live session for everyone.' } });
    }

    const liveEndedAt = row.live_ended_at || null;
    if (liveEndedAt) {
      const closedByName = await resolveSupervisionClosedByName(row);
      return res.json({
        ok: true,
        sessionId: id,
        liveEndedAt,
        meetingClosedAt: liveEndedAt,
        meetingClosedByName: closedByName,
        alreadyEnded: true
      });
    }

    await SupervisionSession.setLiveEnded(id, { endedByUserId: actorUserId });
    const updated = await SupervisionSession.findById(id);
    const closedByName = await resolveSupervisionClosedByName(updated || row, actorUserId);

    let carryover = null;
    try {
      const { carryForwardSupervisionWorkspace } = await import('../services/meetingWorkspaceCarryover.service.js');
      carryover = await carryForwardSupervisionWorkspace({ sessionId: id, actorUserId });
    } catch (e) {
      console.warn('[supervision] workspace carryover failed', e?.message || e);
    }

    const roomSid = String(row.twilio_room_sid || '').trim();
    let videoEnd = null;
    if (roomSid) {
      try {
        videoEnd = await completeRoom(roomSid, {
          closedByName,
          closedAt: updated?.live_ended_at || new Date().toISOString()
        });
      } catch (e) {
        console.warn('[supervision] end-live completeRoom failed', e?.message || e);
      }
    }
    res.json({
      ok: true,
      sessionId: id,
      liveEndedAt: updated?.live_ended_at || new Date().toISOString(),
      meetingClosedAt: updated?.live_ended_at || new Date().toISOString(),
      meetingClosedByName: closedByName,
      videoEnd,
      carryover
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Public endpoint: resolve session to org slug for join redirect.
 * Used when user hits /join/supervision/:sessionId without org slug.
 * sessionId may be numeric id (legacy) or opaque join_token.
 */
export const getSupervisionJoinInfo = async (req, res, next) => {
  try {
    const ref = String(req.params.sessionId || '').trim();
    if (!ref) return res.status(400).json({ error: { message: 'Invalid session id' } });

    const session = await SupervisionSession.resolveByJoinRef(ref);
    if (!session?.id) return res.status(404).json({ error: { message: 'Session not found' } });
    if (String(session.status || '').toUpperCase() === 'CANCELLED') {
      return res.status(404).json({ error: { message: 'Session not found' } });
    }

    const [rows] = await pool.execute(
      `SELECT a.slug, a.portal_url
       FROM agencies a
       WHERE a.id = ? AND a.is_active = TRUE
       LIMIT 1`,
      [Number(session.agency_id || session.agencyId || 0)]
    );
    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });

    const orgSlug = String(row.slug || row.portal_url || '').trim();
    if (!orgSlug) return res.status(404).json({ error: { message: 'Session organization has no portal' } });

    const participantKey = String(
      session.participant_join_token || session.join_token || session.id
    );
    const hostKey = String(session.host_join_token || '').trim();
    const tokenRole = SupervisionSession.classifyJoinTokenRole(session, ref);
    const redirectKey = tokenRole === 'host' && hostKey
      ? hostKey
      : (participantKey || String(session.id));
    const sessionType = String(session.session_type || 'individual').toLowerCase();
    const activeCount = await countActiveJoinPresence(session.id);
    const maxCapacity = maxJoinCapacityForSessionType(sessionType);
    const appJoinUrl = supervisionAppJoinUrl(session);
    const closedByName = session.live_ended_at
      ? await resolveSupervisionClosedByName(session)
      : '';
    res.json({
      orgSlug,
      sessionId: Number(session.id),
      joinToken: redirectKey || null,
      hostJoinToken: hostKey || null,
      participantJoinToken: participantKey || null,
      joinPath: `/join/supervision/${encodeURIComponent(redirectKey)}`,
      hostJoinPath: hostKey ? `/join/supervision/${encodeURIComponent(hostKey)}` : null,
      joinUrl: appJoinUrl,
      participantJoinUrl: appJoinUrl,
      hostJoinUrl: supervisionHostJoinUrl(session),
      liveEndedAt: session.live_ended_at || null,
      meetingClosedAt: session.live_ended_at || null,
      meetingClosedByName: closedByName || null,
      waitingRoomEnabled: isWaitingRoomEnabled(session),
      joinTokenRole: tokenRole,
      sessionType,
      guestJoinAllowed: !isNumericJoinRef(participantKey),
      activeParticipants: activeCount,
      maxParticipants: maxCapacity,
      joinLocked: activeCount >= maxCapacity
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Public guest join: opaque join_token only (not numeric id).
 * No login required. Locks when the room already has capacity filled;
 * unlocks again when someone leaves (presence heartbeat expires / leave).
 */
export const getSupervisionGuestJoin = async (req, res, next) => {
  try {
    if (!isVideoConfigured()) {
      return res.status(503).json({
        error: { message: 'Video is not configured' },
        videoConfigured: false,
        diagnostics: getVideoClientDiagnostics()
      });
    }
    const projectId = resolveVideoProjectId();
    if (!projectId) {
      return res.status(503).json({
        error: { message: 'Vonage Video Application ID is missing. Set VONAGE_APPLICATION_ID.' },
        videoConfigured: false,
        diagnostics: getVideoClientDiagnostics()
      });
    }

    const ref = String(req.params.joinToken || '').trim();
    if (!ref || isNumericJoinRef(ref)) {
      return res.status(400).json({
        error: { message: 'A secure join link is required. Ask the host to share the session join link.' }
      });
    }

    let row = await SupervisionSession.resolveByJoinRef(ref);
    if (!row?.id) {
      return res.status(404).json({ error: { message: 'Session not found' } });
    }
    const tokenRole = SupervisionSession.classifyJoinTokenRole(row, ref);
    // Host link is for authenticated hosts; guests may only use participant/legacy links.
    if (tokenRole === 'host') {
      return res.status(403).json({
        error: { message: 'This is the host join link. Log in as the supervisor to join, or use the participant join link.' }
      });
    }
    const matchesOpaque = [row.join_token, row.participant_join_token, row.host_join_token]
      .map((t) => String(t || ''))
      .includes(ref);
    if (!matchesOpaque) {
      return res.status(404).json({ error: { message: 'Session not found' } });
    }
    const id = Number(row.id);
    row = await maybeReopenAutoFinalizedSessionForJoin(row);
    const status = String(row.status || '').trim().toUpperCase();
    if (['CANCELLED', 'RESCHEDULED', 'MISSED', 'FINALIZED'].includes(status)) {
      return res.status(400).json({ error: { message: `Session is ${status.toLowerCase()} and is not joinable.` } });
    }
    if (row.live_ended_at) {
      const closedByName = await resolveSupervisionClosedByName(row);
      return res.status(410).json({
        error: { message: 'This session has ended.' },
        liveEnded: true,
        liveEndedAt: row.live_ended_at,
        meetingClosedAt: row.live_ended_at,
        meetingClosedByName: closedByName
      });
    }

    const sessionType = String(row.session_type || 'individual').toLowerCase();
    const waitingRoomOn = isWaitingRoomEnabled(row);
    const maxCapacity = maxJoinCapacityForSessionType(sessionType);
    const guestKeyRaw = String(req.query?.guestKey || req.query?.guest_key || '').trim();
    const guestKey = guestKeyRaw.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
    const guestId = guestKey || crypto.randomBytes(12).toString('hex');
    const identity = `guest-${guestId}`;
    const displayName = String(req.query?.displayName || req.query?.name || 'Guest').trim().slice(0, 80) || 'Guest';

    const admitted = await isUserAdmittedToSupervision({ sessionId: id, joinIdentity: identity });
    const useLobby = waitingRoomOn && !admitted;

    const alreadyPresent = await isJoinIdentityActive(id, identity);
    const activeCount = await countActiveJoinPresence(id);
    // Capacity applies to main room; lobby waiters do not consume seats.
    if (!useLobby && !alreadyPresent && activeCount >= maxCapacity) {
      return res.status(409).json({
        error: {
          message: 'This session is full right now. When someone leaves, the join link will work again.'
        },
        joinLocked: true,
        activeParticipants: activeCount,
        maxParticipants: maxCapacity
      });
    }

    let roomName;
    let vonageSessionId = null;
    if (useLobby) {
      roomName = `supervision-${id}-lobby`;
      const lobbyRoom = await createOrGetRoomByUniqueName(roomName);
      vonageSessionId = lobbyRoom?.sid || null;
    } else {
      roomName = row.twilio_room_unique_name || `supervision-${id}`;
      vonageSessionId = String(row.twilio_room_sid || '').trim() || null;
      if (!vonageSessionId) {
        const roomResult = await createOrGetRoomByUniqueName(roomName);
        vonageSessionId = roomResult?.sid || null;
        if (vonageSessionId) {
          await SupervisionSession.setVideoRoom(id, { roomSid: vonageSessionId, uniqueName: roomName });
        }
      }
    }
    if (!vonageSessionId) {
      return res.status(500).json({
        error: { message: 'Failed to create or get video room' },
        diagnostics: getVideoClientDiagnostics()
      });
    }

    const token = await createAccessTokenAsync({
      roomSid: vonageSessionId,
      identity,
      metadata: {
        role: 'guest',
        roleLabel: 'Guest',
        sessionId: id,
        displayName,
        profilePhotoUrl: null
      }
    });
    if (!token) {
      return res.status(500).json({ error: { message: 'Failed to generate access token' } });
    }

    await upsertJoinPresence({
      sessionId: id,
      joinIdentity: identity,
      displayName,
      isGuest: true
    });

    const sessionTitle = await buildSupervisionSessionTitle(id, row);
    const hostStatus = useLobby ? await buildWaitingRoomHostStatus(row) : null;
    const waitingPrep = useLobby ? await buildWaitingRoomPrepPayload(id, { sessionTitle }) : null;
    res.json({
      ok: true,
      guest: true,
      token: String(token).trim(),
      sessionId: vonageSessionId,
      applicationId: projectId,
      apiKey: projectId,
      roomName,
      roomSid: vonageSessionId,
      identity,
      displayName,
      roleLabel: 'Guest',
      profilePhotoUrl: null,
      isSupervisor: false,
      isPresenter: false,
      supervisionSessionId: id,
      sessionTitle: sessionTitle || null,
      sessionType,
      roomMode: useLobby ? 'lobby' : 'main',
      lobbyEnabledForSession: waitingRoomOn,
      waitingRoomEnabled: waitingRoomOn,
      videoConfigured: true,
      activeParticipants: alreadyPresent ? activeCount : activeCount + 1,
      maxParticipants: maxCapacity,
      diagnostics: getVideoClientDiagnostics({ token, sessionId: vonageSessionId }),
      ...(hostStatus || {}),
      ...(waitingPrep || {})
    });
  } catch (e) {
    next(e);
  }
};

/** Public heartbeat / leave for guest or authenticated join identities. */
export const postSupervisionJoinPresence = async (req, res, next) => {
  try {
    const ref = String(req.params.id || '').trim();
    const identity = String(req.body?.identity || req.body?.joinIdentity || '').trim();
    const action = String(req.body?.action || 'heartbeat').toLowerCase();
    if (!ref || !identity) {
      return res.status(400).json({ error: { message: 'identity required' } });
    }
    const row = await SupervisionSession.resolveByJoinRef(ref);
    if (!row?.id) return res.status(404).json({ error: { message: 'Session not found' } });
    const id = Number(row.id);
    const userId = userIdFromSupervisionJoinIdentity(identity);

    if (action === 'leave') {
      await markJoinPresenceLeft({ sessionId: id, joinIdentity: identity });
      if (userId) {
        await recordSupervisionPresenceAttendanceEvent({
          sessionRow: row,
          sessionId: id,
          userId,
          joinIdentity: identity,
          eventType: 'left'
        });
      }
    } else {
      await upsertJoinPresence({
        sessionId: id,
        joinIdentity: identity,
        displayName: req.body?.displayName || null,
        isGuest: String(identity).startsWith('guest-')
      });
      if (userId) {
        const admitted = await isUserAdmittedToSupervision({ sessionId: id, userId, joinIdentity: identity });
        if (admitted) {
          await ensureSupervisionAttendanceSegmentOpen({
            sessionRow: row,
            sessionId: id,
            userId,
            joinIdentity: identity
          });
        }
      }
    }
    const activeCount = await countActiveJoinPresence(id);
    const maxCapacity = maxJoinCapacityForSessionType(row.session_type);
    res.json({
      ok: true,
      activeParticipants: activeCount,
      maxParticipants: maxCapacity,
      joinLocked: activeCount >= maxCapacity
    });
  } catch (e) {
    next(e);
  }
};

/** GET /api/supervision/sessions/:id/live-attendance — live rollups + presence for in-session panel */
export const getSupervisionLiveAttendance = async (req, res, next) => {
  try {
    const ref = String(req.params.id || '').trim();
    if (!ref) return res.status(400).json({ error: { message: 'Invalid session id' } });
    const row = await SupervisionSession.resolveByJoinRef(ref);
    if (!row?.id) return res.status(404).json({ error: { message: 'Session not found' } });
    const id = Number(row.id);

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id,
      sessionId: id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    await syncSupervisionAttendanceWithPresence(id, { sessionRow: row });

    let presenceByUser = await loadSupervisionPresenceByUser(id);
    // Refresh open-segment totals for everyone currently present so the panel ticks live.
    for (const [uid, presence] of presenceByUser.entries()) {
      if (!presence?.isPresent) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        await recomputeAttendanceRollupForUser({
          sessionId: id,
          userId: uid,
          sessionStartAt: row.start_at
        });
      } catch { /* ignore */ }
    }

    const [rollups, attendees, admissionRows] = await Promise.all([
      SupervisionSession.listAttendanceRollupsForSession(id),
      SupervisionSession.listAttendees(id),
      pool.execute(
        `SELECT user_id, join_identity, admitted_at
         FROM supervision_session_video_admissions
         WHERE session_id = ?`,
        [id]
      ).then(([rows]) => rows || []).catch(() => [])
    ]);
    presenceByUser = await loadSupervisionPresenceByUser(id);
    const admittedAtByUser = new Map();
    for (const a of admissionRows || []) {
      const uid = Number(a.user_id || 0) || userIdFromSupervisionJoinIdentity(a.join_identity);
      if (!uid || !a.admitted_at) continue;
      const prev = admittedAtByUser.get(uid);
      const at = parseAsDate(a.admitted_at);
      if (!at) continue;
      if (!prev || at.getTime() < prev.getTime()) admittedAtByUser.set(uid, at);
    }

    const byUser = new Map();
    for (const att of attendees || []) {
      const uid = Number(att.user_id || att.userId || 0);
      if (!uid) continue;
      const firstName = att.first_name || att.firstName || '';
      const lastName = att.last_name || att.lastName || '';
      const email = att.email || '';
      byUser.set(uid, {
        userId: uid,
        firstName,
        lastName,
        email,
        role: att.participant_role || att.participantRole || '',
        isHost: uid === Number(row.supervisor_user_id || 0)
          || uid === Number(row.co_facilitator_user_id || 0),
        isRequired: att.is_required == null ? true : !!Number(att.is_required),
        totalSeconds: 0,
        segmentCount: 0
      });
    }
    for (const r of rollups || []) {
      const uid = Number(r.user_id || 0);
      if (!uid) continue;
      const existing = byUser.get(uid) || {
        userId: uid,
        firstName: '',
        lastName: '',
        email: '',
        role: '',
        isHost: uid === Number(row.supervisor_user_id || 0)
          || uid === Number(row.co_facilitator_user_id || 0),
        isRequired: true
      };
      existing.totalSeconds = Number(r.total_seconds || 0);
      existing.segmentCount = Number(r.segment_count || 0);
      byUser.set(uid, existing);
    }

    // Fill any missing names (rollup-only rows, etc.).
    const missingNameIds = Array.from(byUser.values())
      .filter((p) => !String(p.firstName || '').trim() && !String(p.lastName || '').trim() && !String(p.email || '').trim())
      .map((p) => p.userId);
    if (missingNameIds.length) {
      try {
        const placeholders = missingNameIds.map(() => '?').join(',');
        const [nameRows] = await pool.execute(
          `SELECT id, first_name, last_name, email FROM users WHERE id IN (${placeholders})`,
          missingNameIds
        );
        for (const nr of nameRows || []) {
          const existing = byUser.get(Number(nr.id));
          if (!existing) continue;
          existing.firstName = nr.first_name || '';
          existing.lastName = nr.last_name || '';
          existing.email = nr.email || '';
        }
      } catch { /* ignore */ }
    }

    const nowMs = Date.now();
    const participants = Array.from(byUser.values()).map((p) => {
      const name = [p.firstName, p.lastName].filter(Boolean).join(' ').trim()
        || p.email
        || `User #${p.userId}`;
      const totalMinutes = Math.round((Number(p.totalSeconds || 0) / 60) * 100) / 100;
      const presence = presenceByUser.get(p.userId) || {};
      const presenceJoined = parseAsDate(presence.joinedAt);
      const admittedAt = admittedAtByUser.get(p.userId) || null;
      let waitSeconds = 0;
      if (presenceJoined) {
        const waitEndMs = admittedAt
          ? admittedAt.getTime()
          : (presence.isPresent ? nowMs : (parseAsDate(presence.leftAt)?.getTime() || nowMs));
        if (Number.isFinite(waitEndMs) && waitEndMs > presenceJoined.getTime()) {
          waitSeconds = Math.round((waitEndMs - presenceJoined.getTime()) / 1000);
        }
      }
      const waitMinutes = Math.round((waitSeconds / 60) * 100) / 100;
      return {
        userId: p.userId,
        name,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        role: p.role,
        isHost: !!p.isHost,
        isRequired: p.isRequired !== false,
        totalSeconds: Number(p.totalSeconds || 0),
        totalMinutes,
        waitSeconds,
        waitMinutes,
        admittedAt: admittedAt ? admittedAt.toISOString() : null,
        segmentCount: Number(p.segmentCount || 0),
        isPresent: !!presence.isPresent,
        leftAt: presence.leftAt || null,
        joinedAt: presence.joinedAt || null,
        lastSeenAt: presence.lastSeenAt || null,
        presenceStatus: presence.isPresent ? 'active' : (presence.leftAt ? 'left' : 'away')
      };
    }).sort((a, b) => {
      // Host first, then who's actually in the room, then required/mandatory
      // attendees, then everyone else — alphabetical within each bucket.
      if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
      if (a.isPresent !== b.isPresent) return a.isPresent ? -1 : 1;
      if (a.isRequired !== b.isRequired) return a.isRequired ? -1 : 1;
      return String(a.name).localeCompare(String(b.name));
    });

    const namesCsv = participants.map((p) => p.name).join(', ');
    const namesWithTimeCsv = participants
      .map((p) => `${p.name} (${p.totalMinutes}m)`)
      .join(', ');

    res.json({
      sessionId: id,
      sessionStartAt: row.start_at || null,
      participants,
      copyNamesCsv: namesCsv,
      copyNamesWithTimeCsv: namesWithTimeCsv
    });
  } catch (e) {
    next(e);
  }
};

export const getSupervisionVideoToken = async (req, res, next) => {
  try {
    if (!isVideoConfigured()) {
      return res.status(503).json({
        error: { message: 'Video is not configured' },
        videoConfigured: false,
        diagnostics: getVideoClientDiagnostics()
      });
    }

    const projectId = resolveVideoProjectId();
    if (!projectId) {
      return res.status(503).json({
        error: { message: 'Vonage Video Application ID is missing. Set VONAGE_APPLICATION_ID.' },
        videoConfigured: false,
        diagnostics: getVideoClientDiagnostics()
      });
    }

    const ref = String(req.params.id || '').trim();
    if (!ref) return res.status(400).json({ error: { message: 'Invalid session id' } });

    let row = await SupervisionSession.resolveByJoinRef(ref);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });
    const id = Number(row.id);
    row = await maybeReopenAutoFinalizedSessionForJoin(row);
    const status = String(row.status || '').trim().toUpperCase();
    if (['CANCELLED', 'RESCHEDULED', 'MISSED', 'FINALIZED'].includes(status)) {
      return res.status(400).json({ error: { message: `Session is ${status.toLowerCase()} and is not joinable.` } });
    }
    if (row.live_ended_at) {
      const closedByName = await resolveSupervisionClosedByName(row);
      return res.status(410).json({
        error: { message: 'This session has ended.' },
        liveEnded: true,
        liveEndedAt: row.live_ended_at,
        meetingClosedAt: row.live_ended_at,
        meetingClosedByName: closedByName
      });
    }

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id,
      sessionId: id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const actorUserId = Number(req.user?.id || 0);
    if (!actorUserId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const roomParam = String(req.query?.room || '').trim().toLowerCase();
    const tokenRole = SupervisionSession.classifyJoinTokenRole(row, ref);
    const isSupervisor = actorUserId === Number(row.supervisor_user_id)
      || actorUserId === Number(row.co_facilitator_user_id || 0);
    // Host join link may only be used by the facilitator; others get a clear error (no guest fallthrough).
    if (tokenRole === 'host' && !isSupervisor) {
      return res.status(403).json({
        error: {
          message: 'This host join link is for the session facilitator. Use the participant join link, or ask the host to admit you.'
        }
      });
    }
    const sessionType = String(row.session_type || 'individual').toLowerCase();
    const waitingRoomOn = isWaitingRoomEnabled(row);

    let isPresenter = false;
    try {
      const [presenterRows] = await pool.execute(
        `SELECT 1 FROM supervision_session_presenters WHERE session_id = ? AND user_id = ? LIMIT 1`,
        [id, actorUserId]
      );
      isPresenter = !!(presenterRows?.length);
    } catch {
      isPresenter = false;
    }

    const identity = `user-${actorUserId}`;
    // JWT req.user often lacks first/last name — load profile for labels.
    let actorProfile = null;
    try {
      actorProfile = await User.findById(actorUserId);
    } catch {
      actorProfile = null;
    }
    const displayName = displayNameFromUser(actorProfile || req.user) || identity;
    const profilePhotoUrl = await profilePhotoUrlForUserId(actorUserId);

    // Host and assigned presenters always bypass the waiting room so their presence/attendance
    // accrues immediately — a presenter should never be missing from the attendance list.
    if (isSupervisor || isPresenter) {
      try {
        await admitSupervisionJoinIdentity({
          sessionId: id,
          userId: actorUserId,
          joinIdentity: identity
        });
      } catch {
        /* ignore */
      }
    }

    const admitted = isSupervisor || isPresenter
      || await isUserAdmittedToSupervision({ sessionId: id, userId: actorUserId, joinIdentity: identity });

    // Hosts and presenters always main. Everyone else waits in lobby when waiting room is on
    // (unless already admitted).
    const forceMain = roomParam === 'main';
    const forceLobby = roomParam === 'lobby';
    const useLobby = !isSupervisor && !isPresenter && waitingRoomOn && (forceLobby || (!forceMain && !admitted));

    if (forceMain && !isSupervisor && !isPresenter && waitingRoomOn && !admitted) {
      return res.status(403).json({ error: { message: 'Not admitted yet. Wait in the lobby.' } });
    }

    let vonageSessionId = null;
    let roomName = null;

    if (useLobby) {
      roomName = `supervision-${id}-lobby`;
      const lobbyRoom = await createOrGetRoomByUniqueName(roomName);
      vonageSessionId = lobbyRoom?.sid || null;
    } else {
      roomName = row.twilio_room_unique_name || `supervision-${id}`;
      vonageSessionId = String(row.twilio_room_sid || '').trim() || null;
      if (!vonageSessionId) {
        const roomResult = await createOrGetRoomByUniqueName(roomName);
        vonageSessionId = roomResult?.sid || null;
        if (vonageSessionId) {
          await SupervisionSession.setVideoRoom(id, {
            roomSid: vonageSessionId,
            uniqueName: roomName
          });
        }
      }
    }

    if (!vonageSessionId) {
      return res.status(500).json({
        error: { message: 'Failed to create or get video room' },
        diagnostics: getVideoClientDiagnostics()
      });
    }

    // Capacity lock applies to main-room joiners who are not already counted as present.
    const maxCapacity = maxJoinCapacityForSessionType(sessionType);
    const alreadyPresent = await isJoinIdentityActive(id, identity);
    const activeCount = await countActiveJoinPresence(id);
    if (!useLobby && !alreadyPresent && activeCount >= maxCapacity) {
      return res.status(409).json({
        error: {
          message: 'This session is full right now. When someone leaves, you can join again.'
        },
        joinLocked: true,
        activeParticipants: activeCount,
        maxParticipants: maxCapacity
      });
    }

    const role = isSupervisor ? 'supervisor' : (isPresenter ? 'presenter' : 'supervisee');
    const roleLabel = isSupervisor ? 'Supervisor' : (isPresenter ? 'Presenter' : 'Supervisee');

    const token = await createAccessTokenAsync({
      roomSid: vonageSessionId,
      identity,
      metadata: {
        role,
        roleLabel,
        sessionId: id,
        displayName,
        profilePhotoUrl
      }
    });

    if (!token) {
      return res.status(500).json({ error: { message: 'Failed to generate access token' } });
    }

    await upsertJoinPresence({
      sessionId: id,
      joinIdentity: identity,
      displayName,
      isGuest: false
    });

    if (!useLobby && admitted) {
      try {
        await ensureSupervisionAttendanceSegmentOpen({
          sessionRow: row,
          sessionId: id,
          userId: actorUserId,
          joinIdentity: identity
        });
      } catch {
        /* ignore */
      }
    }

    const sessionTitle = await buildSupervisionSessionTitle(id, row);
    const hostStatus = useLobby && !isSupervisor ? await buildWaitingRoomHostStatus(row) : null;
    const waitingPrep = useLobby && !isSupervisor
      ? await buildWaitingRoomPrepPayload(id, { sessionTitle })
      : null;

    res.json({
      ok: true,
      token: String(token).trim(),
      sessionId: vonageSessionId,
      applicationId: projectId,
      apiKey: projectId,
      roomName,
      roomSid: vonageSessionId,
      identity,
      displayName,
      roleLabel,
      profilePhotoUrl,
      isSupervisor: !!isSupervisor,
      isPresenter: !!isPresenter,
      supervisionSessionId: id,
      sessionTitle: sessionTitle || null,
      sessionType,
      roomMode: useLobby ? 'lobby' : 'main',
      lobbyEnabledForSession: waitingRoomOn,
      waitingRoomEnabled: waitingRoomOn,
      joinUrl: supervisionAppJoinUrl(row),
      hostJoinUrl: supervisionHostJoinUrl(row),
      videoConfigured: true,
      activeParticipants: alreadyPresent ? activeCount : activeCount + 1,
      maxParticipants: maxCapacity,
      diagnostics: getVideoClientDiagnostics({ token, sessionId: vonageSessionId }),
      ...(hostStatus || {}),
      ...(waitingPrep || {})
    });
  } catch (e) {
    next(e);
  }
};

export const getLobbyParticipants = async (req, res, next) => {
  try {
    if (!isVideoConfigured()) {
      return res.status(503).json({ error: { message: 'Video is not configured' } });
    }

    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });

    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });
    const status = String(row.status || '').trim().toUpperCase();
    if (['CANCELLED', 'RESCHEDULED', 'MISSED', 'FINALIZED'].includes(status)) {
      return res.status(400).json({ error: { message: `Session is ${status.toLowerCase()} and is not joinable.` } });
    }

    const actorUserId = Number(req.user?.id || 0);
    if (!actorUserId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const isSupervisor = actorUserId === Number(row.supervisor_user_id)
      || actorUserId === Number(row.co_facilitator_user_id || 0);
    if (!isSupervisor) {
      return res.status(403).json({ error: { message: 'Only the supervisor can view lobby participants' } });
    }

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id,
      sessionId: id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const participants = await listWaitingLobbyPresence(id);
    for (const p of participants) {
      if (p.userId) {
        try {
          const [rows] = await pool.execute(
            'SELECT first_name, last_name, profile_photo_path FROM users WHERE id = ? LIMIT 1',
            [p.userId]
          );
          const u = rows?.[0];
          if (u) {
            const name = `${String(u.first_name || '').trim()} ${String(u.last_name || '').trim()}`.trim();
            if (name) p.displayName = name;
            p.profilePhotoUrl = publicUploadsUrlFromStoredPath(u.profile_photo_path || null) || null;
          }
        } catch {
          /* ignore */
        }
      }
    }

    res.json({ participants, waitingRoomEnabled: isWaitingRoomEnabled(row) });
  } catch (e) {
    next(e);
  }
};

export const admitToMainRoom = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userIdRaw = req.params.userId;
    const joinIdentityBody = String(req.body?.joinIdentity || req.query?.joinIdentity || '').trim();
    // Allow admit by user id OR guest identity (userId path param may be "guest-xxx")
    const userIdNum = /^\d+$/.test(String(userIdRaw || '')) ? parseInt(userIdRaw, 10) : 0;
    const joinIdentity = joinIdentityBody
      || (!userIdNum && String(userIdRaw || '').startsWith('guest-') ? String(userIdRaw) : '')
      || (userIdNum ? `user-${userIdNum}` : '');
    if (!id || (!userIdNum && !joinIdentity)) {
      return res.status(400).json({ error: { message: 'Invalid session or participant id' } });
    }

    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });

    const actorUserId = Number(req.user?.id || 0);
    if (!actorUserId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const isSupervisor = actorUserId === Number(row.supervisor_user_id)
      || actorUserId === Number(row.co_facilitator_user_id || 0);
    if (!isSupervisor) {
      return res.status(403).json({ error: { message: 'Only the supervisor can admit participants' } });
    }

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id,
      sessionId: id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    if (userIdNum) {
      const [attendeeRows] = await pool.execute(
        'SELECT 1 FROM supervision_session_attendees WHERE session_id = ? AND user_id = ? LIMIT 1',
        [id, userIdNum]
      );
      const [presenterRows] = await pool.execute(
        'SELECT 1 FROM supervision_session_presenters WHERE session_id = ? AND user_id = ? LIMIT 1',
        [id, userIdNum]
      );
      const isParticipant =
        userIdNum === Number(row.supervisee_user_id)
        || userIdNum === Number(row.supervisor_user_id)
        || userIdNum === Number(row.co_facilitator_user_id || 0)
        || !!(attendeeRows?.length)
        || !!(presenterRows?.length)
        || await userMatchesSupervisionOpenAudience({ sessionRow: row, userId: userIdNum });
      if (!isParticipant) {
        return res.status(400).json({ error: { message: 'User is not a participant in this session' } });
      }
    } else if (!String(joinIdentity).startsWith('guest-')) {
      return res.status(400).json({ error: { message: 'Invalid guest identity' } });
    }

    const admitted = await admitSupervisionJoinIdentity({
      sessionId: id,
      userId: userIdNum || null,
      joinIdentity
    });
    if (!admitted) {
      return res.status(500).json({ error: { message: 'Failed to admit participant' } });
    }

    let attendance = null;
    if (userIdNum) {
      try {
        attendance = await commenceSupervisionAttendance({
          sessionRow: row,
          sessionId: id,
          includeUserIds: [userIdNum]
        });
      } catch {
        /* ignore */
      }
    }

    res.json({
      ok: true,
      admitted: userIdNum || joinIdentity,
      joinIdentity,
      meetingCommenced: true,
      attendanceStartedCount: Number(attendance?.opened || 0)
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Host live control: turn waiting room off (and admit everyone currently waiting)
 * or turn it back on for later arrivals.
 */
export const setSupervisionWaitingRoomLive = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });
    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });

    const actorUserId = Number(req.user?.id || 0);
    if (!actorUserId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    const isSupervisor = actorUserId === Number(row.supervisor_user_id)
      || actorUserId === Number(row.co_facilitator_user_id || 0);
    if (!isSupervisor) {
      return res.status(403).json({ error: { message: 'Only the host can change the waiting room' } });
    }

    const enabled = !(req.body?.enabled === false || req.body?.enabled === 0 || req.body?.enabled === '0');
    const admitWaiting = req.body?.admitWaiting !== false;
    await SupervisionSession.updateById(id, { waitingRoomEnabled: enabled });

    let admittedCount = 0;
    if (!enabled && admitWaiting) {
      const waiters = await listWaitingLobbyPresence(id);
      for (const p of waiters || []) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await admitSupervisionJoinIdentity({
          sessionId: id,
          userId: p.userId || null,
          joinIdentity: p.joinIdentity
        });
        if (ok) {
          admittedCount += 1;
          if (p.userId) {
            try {
              // eslint-disable-next-line no-await-in-loop
              await ensureSupervisionAttendanceSegmentOpen({
                sessionRow: row,
                sessionId: id,
                userId: p.userId,
                joinIdentity: p.joinIdentity
              });
            } catch {
              /* ignore */
            }
          }
        }
      }
    }

    let attendance = null;
    if (!enabled && admitWaiting) {
      try {
        attendance = await commenceSupervisionAttendance({ sessionRow: row, sessionId: id });
      } catch (e) {
        console.warn('[supervision] attendance open on waiting-room release failed', e?.message || e);
      }
    }

    const fresh = await SupervisionSession.findById(id);
    res.json({
      ok: true,
      waitingRoomEnabled: isWaitingRoomEnabled(fresh || row),
      admittedCount,
      meetingCommenced: !enabled && admitWaiting,
      attendanceStartedCount: Number(attendance?.opened || 0)
    });
  } catch (e) {
    next(e);
  }
};

async function buildMainRoomAdmissionPayload({ row, identity, displayName, roleLabel, role, profilePhotoUrl = null }) {
  const id = Number(row.id);
  const projectId = resolveVideoProjectId();
  const mainName = row.twilio_room_unique_name || `supervision-${id}`;
  let vonageSessionId = String(row.twilio_room_sid || '').trim() || null;
  if (!vonageSessionId) {
    const roomResult = await createOrGetRoomByUniqueName(mainName);
    vonageSessionId = roomResult?.sid || null;
    if (vonageSessionId) {
      await SupervisionSession.setVideoRoom(id, {
        roomSid: vonageSessionId,
        uniqueName: mainName
      });
    }
  }
  if (!vonageSessionId) return null;
  const token = await createAccessTokenAsync({
    roomSid: vonageSessionId,
    identity,
    metadata: {
      role,
      roleLabel,
      sessionId: id,
      displayName,
      profilePhotoUrl
    }
  });
  if (!token) return null;
  const sessionTitle = await buildSupervisionSessionTitle(id, row);
  const sessionType = String(row.session_type || 'individual').toLowerCase();
  const waitingRoomOn = isWaitingRoomEnabled(row);
  return {
    admitted: true,
    token: String(token).trim(),
    sessionId: vonageSessionId,
    applicationId: projectId,
    apiKey: projectId,
    roomName: mainName,
    roomSid: vonageSessionId,
    identity,
    displayName,
    roleLabel,
    profilePhotoUrl,
    isSupervisor: role === 'supervisor',
    isPresenter: role === 'presenter',
    guest: String(identity).startsWith('guest-'),
    supervisionSessionId: id,
    sessionTitle: sessionTitle || null,
    sessionType,
    roomMode: 'main',
    lobbyEnabledForSession: waitingRoomOn,
    waitingRoomEnabled: waitingRoomOn,
    videoConfigured: true,
    diagnostics: getVideoClientDiagnostics({ token, sessionId: vonageSessionId })
  };
}

export const getAdmissionStatus = async (req, res, next) => {
  try {
    if (!isVideoConfigured()) {
      return res.status(503).json({ error: { message: 'Video is not configured' } });
    }

    const ref = String(req.params.id || '').trim();
    if (!ref) return res.status(400).json({ error: { message: 'Invalid session id' } });

    const row = await SupervisionSession.resolveByJoinRef(ref);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });
    const id = Number(row.id);
    const waitingRoomOn = isWaitingRoomEnabled(row);
    const sessionType = String(row.session_type || 'individual').toLowerCase();

    const actorUserId = Number(req.user?.id || 0);
    if (!actorUserId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id,
      sessionId: id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const isSupervisor = actorUserId === Number(row.supervisor_user_id)
      || actorUserId === Number(row.co_facilitator_user_id || 0);
    if (isSupervisor) {
      return res.json({
        admitted: true,
        role: 'supervisor',
        sessionType,
        roomMode: 'main',
        lobbyEnabledForSession: waitingRoomOn,
        waitingRoomEnabled: waitingRoomOn
      });
    }

    const identity = `user-${actorUserId}`;
    let admitted = await isUserAdmittedToSupervision({
      sessionId: id,
      userId: actorUserId,
      joinIdentity: identity
    });

    // Host turned waiting room off — auto-admit and hand out a main-room token.
    if (!waitingRoomOn && !admitted) {
      await admitSupervisionJoinIdentity({
        sessionId: id,
        userId: actorUserId,
        joinIdentity: identity
      });
      admitted = true;
    }

    if (!admitted) {
      const hostStatus = await buildWaitingRoomHostStatus(row);
      const sessionTitle = await buildSupervisionSessionTitle(id, row);
      const waitingPrep = await buildWaitingRoomPrepPayload(id, { sessionTitle });
      return res.json({
        admitted: false,
        sessionType,
        roomMode: 'lobby',
        lobbyEnabledForSession: waitingRoomOn,
        waitingRoomEnabled: waitingRoomOn,
        ...hostStatus,
        ...waitingPrep
      });
    }

    let isPresenter = false;
    try {
      const [presenterRows] = await pool.execute(
        `SELECT 1 FROM supervision_session_presenters WHERE session_id = ? AND user_id = ? LIMIT 1`,
        [id, actorUserId]
      );
      isPresenter = !!(presenterRows?.length);
    } catch {
      isPresenter = false;
    }
    const role = isPresenter ? 'presenter' : 'supervisee';
    const roleLabel = isPresenter ? 'Presenter' : 'Supervisee';
    const displayName = displayNameFromUser(req.user) || identity;
    const profilePhotoUrl = await profilePhotoUrlForUserId(actorUserId);
    const payload = await buildMainRoomAdmissionPayload({
      row,
      identity,
      displayName,
      roleLabel,
      role,
      profilePhotoUrl
    });
    if (!payload) {
      return res.status(500).json({ error: { message: 'Failed to get main room' } });
    }
    try {
      await ensureSupervisionAttendanceSegmentOpen({
        sessionRow: row,
        sessionId: id,
        userId: actorUserId,
        joinIdentity: identity
      });
    } catch {
      /* ignore */
    }
    res.json(payload);
  } catch (e) {
    next(e);
  }
};

/** Public guest admission poll (opaque join token + guest identity). */
export const getGuestAdmissionStatus = async (req, res, next) => {
  try {
    if (!isVideoConfigured()) {
      return res.status(503).json({ error: { message: 'Video is not configured' } });
    }
    const ref = String(req.params.joinToken || '').trim();
    const guestKeyRaw = String(req.query?.guestKey || req.query?.guest_key || '').trim();
    const guestKey = guestKeyRaw.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
    if (!ref || isNumericJoinRef(ref) || !guestKey) {
      return res.status(400).json({ error: { message: 'joinToken and guestKey required' } });
    }
    const row = await SupervisionSession.resolveByJoinRef(ref);
    if (!row?.id) return res.status(404).json({ error: { message: 'Session not found' } });
    const tokenRole = SupervisionSession.classifyJoinTokenRole(row, ref);
    if (tokenRole === 'host') {
      return res.status(403).json({ error: { message: 'Host link cannot be used for guest admission' } });
    }
    const id = Number(row.id);
    const waitingRoomOn = isWaitingRoomEnabled(row);
    const sessionType = String(row.session_type || 'individual').toLowerCase();
    const identity = `guest-${guestKey}`;
    let admitted = await isUserAdmittedToSupervision({ sessionId: id, joinIdentity: identity });
    if (!waitingRoomOn && !admitted) {
      await admitSupervisionJoinIdentity({ sessionId: id, joinIdentity: identity });
      admitted = true;
    }
    if (!admitted) {
      const hostStatus = await buildWaitingRoomHostStatus(row);
      const sessionTitle = await buildSupervisionSessionTitle(id, row);
      const waitingPrep = await buildWaitingRoomPrepPayload(id, { sessionTitle });
      return res.json({
        admitted: false,
        sessionType,
        roomMode: 'lobby',
        lobbyEnabledForSession: true,
        waitingRoomEnabled: true,
        ...hostStatus,
        ...waitingPrep
      });
    }
    const displayName = String(req.query?.displayName || req.query?.name || 'Guest').trim().slice(0, 80) || 'Guest';
    const payload = await buildMainRoomAdmissionPayload({
      row,
      identity,
      displayName,
      roleLabel: 'Guest',
      role: 'guest',
      profilePhotoUrl: null
    });
    if (!payload) {
      return res.status(500).json({ error: { message: 'Failed to get main room' } });
    }
    res.json(payload);
  } catch (e) {
    next(e);
  }
};

async function upsertSessionTranscriptText({
  sessionId,
  transcript,
  speakerLabel = null,
  updatedByUserId = null,
  replace = false
}) {
  const sid = Number(sessionId || 0);
  const chunk = String(transcript || '').trim();
  if (!sid || !chunk) return null;

  const label = String(speakerLabel || '').trim();
  const stamped = label
    ? `[${label}] ${chunk}`
    : chunk;

  await SupervisionSessionArtifact.ensureTagged({ sessionId: sid });
  const existing = await SupervisionSessionArtifact.findBySessionId(sid);
  if (!replace) {
    if (existing?.transcript_stopped_at) {
      const err = new Error('Transcription was stopped for this session.');
      err.status = 409;
      err.transcriptStoppedAt = existing.transcript_stopped_at;
      err.transcriptStoppedByName = existing.transcript_stopped_by_name || null;
      throw err;
    }
    if (existing?.transcript_paused === 1 || existing?.transcript_paused === true) {
      const err = new Error('Transcription is paused.');
      err.status = 409;
      err.transcriptPaused = true;
      throw err;
    }
  }

  let nextText = stamped;
  if (!replace) {
    const prev = String(existing?.transcript_text || '').trim();
    if (prev) {
      // Avoid duplicating the exact same chunk on repeated flush.
      if (prev.includes(stamped)) nextText = prev;
      else nextText = `${prev}\n${stamped}`;
    }
  }

  await SupervisionSessionArtifact.upsertBySessionId({
    sessionId: sid,
    transcriptText: nextText.slice(0, 120000),
    updatedByUserId: updatedByUserId ? Number(updatedByUserId) : null
  });

  const { triggerSupervisionSummaryFromTranscript } = await import('../services/supervisionTranscriptSummary.service.js');
  await triggerSupervisionSummaryFromTranscript(sid).catch((e) => {
    console.error('[Supervision] AI summary from client transcript:', e?.message);
  });
  return { sessionId: sid, chars: nextText.length };
}

export const saveClientTranscript = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });

    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id,
      sessionId: id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const transcript = String(req.body?.transcript || '').trim();
    if (!transcript) return res.status(400).json({ error: { message: 'transcript is required' } });

    const out = await upsertSessionTranscriptText({
      sessionId: id,
      transcript,
      speakerLabel: req.body?.speakerLabel || req.body?.displayName || null,
      updatedByUserId: Number(req.user?.id || 0) || null,
      replace: req.body?.replace === true
    });

    res.json({ ok: true, sessionId: id, chars: out?.chars || 0 });
  } catch (e) {
    if (e?.status === 409) {
      return res.status(409).json({
        error: { message: e.message },
        transcriptPaused: !!e.transcriptPaused,
        transcriptStoppedAt: e.transcriptStoppedAt || null,
        transcriptStoppedByName: e.transcriptStoppedByName || null
      });
    }
    next(e);
  }
};

/** POST /api/supervision/sessions/:id/transcript-control — pause | resume | stop (supervisor) */
export const postSupervisionTranscriptControl = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });
    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });

    const actorId = Number(req.user?.id || 0);
    if (!actorId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const canControl = await canFacilitateSupervisionRow(req, row);
    if (!canControl) {
      return res.status(403).json({ error: { message: 'Only the supervisor/facilitator can control transcription.' } });
    }

    const action = String(req.body?.action || '').trim().toLowerCase();
    if (!['pause', 'resume', 'stop'].includes(action)) {
      return res.status(400).json({ error: { message: "action must be 'pause', 'resume', or 'stop'" } });
    }

    await SupervisionSessionArtifact.ensureTagged({ sessionId: id, updatedByUserId: actorId });
    const existing = await SupervisionSessionArtifact.findBySessionId(id);
    if (existing?.transcript_stopped_at && action !== 'stop') {
      return res.status(400).json({
        error: { message: 'Transcription was stopped and cannot be resumed.' },
        transcriptStoppedAt: existing.transcript_stopped_at,
        transcriptStoppedByName: existing.transcript_stopped_by_name || null
      });
    }

    const displayName = String(
      req.body?.displayName
        || `${req.user?.firstName || req.user?.first_name || ''} ${req.user?.lastName || req.user?.last_name || ''}`.trim()
        || req.user?.email
        || ''
    ).trim().slice(0, 255) || `User ${actorId}`;

    const now = mysqlNowDateTime();
    if (action === 'pause') {
      await pool.execute(
        `UPDATE supervision_session_artifacts
         SET transcript_paused = 1, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE session_id = ? LIMIT 1`,
        [actorId, id]
      );
    } else if (action === 'resume') {
      await pool.execute(
        `UPDATE supervision_session_artifacts
         SET transcript_paused = 0, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE session_id = ? LIMIT 1`,
        [actorId, id]
      );
    } else {
      await pool.execute(
        `UPDATE supervision_session_artifacts
         SET transcript_paused = 0,
             transcript_stopped_at = COALESCE(transcript_stopped_at, ?),
             transcript_stopped_by_user_id = COALESCE(transcript_stopped_by_user_id, ?),
             transcript_stopped_by_name = COALESCE(transcript_stopped_by_name, ?),
             updated_by_user_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE session_id = ? LIMIT 1`,
        [now, actorId, displayName, actorId, id]
      );
    }

    const artifact = await SupervisionSessionArtifact.findBySessionId(id);
    res.json({
      ok: true,
      sessionId: id,
      action,
      transcriptPaused: !!(artifact?.transcript_paused === 1 || artifact?.transcript_paused === true),
      transcriptStoppedAt: artifact?.transcript_stopped_at || null,
      transcriptStoppedByUserId: artifact?.transcript_stopped_by_user_id
        ? Number(artifact.transcript_stopped_by_user_id)
        : null,
      transcriptStoppedByName: artifact?.transcript_stopped_by_name || null
    });
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(503).json({
        error: { message: 'Transcript control requires migration 1095.' }
      });
    }
    next(e);
  }
};

/**
 * Public guest transcript flush (opaque join_token only).
 * Used by live browser speech capture during Vonage sessions.
 */
export const saveGuestTranscript = async (req, res, next) => {
  try {
    const ref = String(req.params.joinToken || '').trim();
    if (!ref || isNumericJoinRef(ref)) {
      return res.status(400).json({ error: { message: 'A secure join link is required.' } });
    }
    const row = await SupervisionSession.resolveByJoinRef(ref);
    if (!row?.id) {
      return res.status(404).json({ error: { message: 'Session not found' } });
    }
    const matchesOpaque = [row.join_token, row.participant_join_token, row.host_join_token]
      .map((t) => String(t || ''))
      .includes(ref);
    if (!matchesOpaque) {
      return res.status(404).json({ error: { message: 'Session not found' } });
    }
    const transcript = String(req.body?.transcript || '').trim();
    if (!transcript) return res.status(400).json({ error: { message: 'transcript is required' } });

    const out = await upsertSessionTranscriptText({
      sessionId: Number(row.id),
      transcript,
      speakerLabel: req.body?.speakerLabel || req.body?.displayName || 'Guest',
      updatedByUserId: null,
      replace: false
    });
    res.json({ ok: true, sessionId: Number(row.id), chars: out?.chars || 0 });
  } catch (e) {
    if (e?.status === 409) {
      return res.status(409).json({
        error: { message: e.message },
        transcriptPaused: !!e.transcriptPaused,
        transcriptStoppedAt: e.transcriptStoppedAt || null,
        transcriptStoppedByName: e.transcriptStoppedByName || null
      });
    }
    next(e);
  }
};

export const listSupervisionAttendanceLogs = async (req, res, next) => {
  try {
    const actorId = Number(req.user?.id || 0);
    if (!actorId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    const role = String(req.user?.role || '').toLowerCase();

    const agencyId = Number(req.query?.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const actorAgencies = await User.getAgencies(actorId);
    const hasAgencyAccess = (actorAgencies || []).some((a) => Number(a?.id) === agencyId);
    if (!hasAgencyAccess) return res.status(403).json({ error: { message: 'Access denied for this agency' } });
    if (!canViewAgencySupervisionLogs(role)) {
      return res.status(403).json({ error: { message: 'Only admin/staff roles can view supervision attendance logs' } });
    }
    await autoFinalizeOverdueSessions({ agencyId, actorUserId: actorId });

    const startDate = String(req.query?.startDate || '').slice(0, 10) || null;
    const endDate = String(req.query?.endDate || '').slice(0, 10) || null;
    const sessionId = req.query?.sessionId ? Number(req.query.sessionId) : null;
    const userId = req.query?.userId ? Number(req.query.userId) : null;

    const rows = await SupervisionSession.listAttendanceLogsForAgency({
      agencyId,
      startDate,
      endDate,
      sessionId,
      userId
    });

    const logs = [];
    for (const r of (rows || [])) {
      const participantRole = String(r.participant_role || '').trim().toLowerCase() || 'supervisee';
      const pay = await resolveSupervisionPayForParticipant({
        agencyId,
        userId: Number(r.user_id),
        participantRole,
        sessionType: String(r.session_type || 'individual'),
        asOfDate: String(r.start_at || '').slice(0, 10)
      });
      const hours = Number(r.total_seconds || 0) / 3600;
      const unitHours = Number.isFinite(hours) ? Math.round(hours * 100) / 100 : 0;
      const rate = Number(pay.rateAmountTotalPerHour || pay.rateAmount || 0);
      const amount = pay.payable ? Math.round(unitHours * rate * 100) / 100 : 0;

      logs.push({
        sessionId: Number(r.session_id),
        agencyId: Number(r.agency_id),
        sessionType: String(r.session_type || 'individual'),
        sessionStatus: r.session_status || null,
        startAt: r.start_at,
        endAt: r.end_at,
        googleMeetLink: r.google_meet_link || null,
        artifactTaggedAt: r.artifact_tagged_at || null,
        transcriptUrl: r.artifact_transcript_url || null,
        summaryText: r.artifact_summary_text || null,
        supervisorName: String(r.supervisor_name || '').trim() || null,
        supervisorEmail: String(r.supervisor_email || '').trim() || null,
        userId: Number(r.user_id),
        participantName: String(r.participant_name || '').trim() || null,
        participantEmail: String(r.participant_email || '').trim() || null,
        participantRole,
        isRequired: Number(r.is_required || 0) === 1,
        firstJoinedAt: r.first_joined_at || null,
        lastLeftAt: r.last_left_at || null,
        totalSeconds: Number(r.total_seconds || 0),
        totalHours: unitHours,
        segmentCount: Number(r.segment_count || 0),
        isFinalized: Number(r.is_finalized || 0) === 1,
        pay: {
          payable: !!pay.payable,
          reason: pay.reason || null,
          serviceCode: pay.serviceCode || null,
          serviceCodes: Array.isArray(pay.serviceCodes) ? pay.serviceCodes : (pay.serviceCode ? [pay.serviceCode] : []),
          rateBreakdown: Array.isArray(pay.rateBreakdown) ? pay.rateBreakdown : [],
          rateAmount: rate,
          rateUnit: pay.rateUnit || 'per_hour',
          rateSource: pay.rateSource || 'none',
          computedAmount: amount,
          eligibility: pay.eligibility || null
        }
      });
    }

    res.json({ ok: true, agencyId, count: logs.length, logs });
  } catch (e) {
    next(e);
  }
};

export const exportSupervisionAttendanceLogsCsv = async (req, res, next) => {
  try {
    const actorId = Number(req.user?.id || 0);
    if (!actorId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    const role = String(req.user?.role || '').toLowerCase();

    const agencyId = Number(req.query?.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const actorAgencies = await User.getAgencies(actorId);
    const hasAgencyAccess = (actorAgencies || []).some((a) => Number(a?.id) === agencyId);
    if (!hasAgencyAccess) return res.status(403).json({ error: { message: 'Access denied for this agency' } });
    if (!canViewAgencySupervisionLogs(role)) {
      return res.status(403).json({ error: { message: 'Only admin/staff roles can export supervision attendance logs' } });
    }
    await autoFinalizeOverdueSessions({ agencyId, actorUserId: actorId });

    const startDate = String(req.query?.startDate || '').slice(0, 10) || null;
    const endDate = String(req.query?.endDate || '').slice(0, 10) || null;
    const sessionId = req.query?.sessionId ? Number(req.query.sessionId) : null;
    const userId = req.query?.userId ? Number(req.query.userId) : null;

    const rows = await SupervisionSession.listAttendanceLogsForAgency({
      agencyId,
      startDate,
      endDate,
      sessionId,
      userId
    });

    const headers = [
      'sessionId',
      'sessionType',
      'sessionStatus',
      'participantName',
      'participantEmail',
      'participantRole',
      'startAt',
      'endAt',
      'firstJoinedAt',
      'lastLeftAt',
      'totalSeconds',
      'totalHours',
      'segmentCount',
      'isFinalized',
      'serviceCodes',
      'rateAmountPerHour',
      'computedAmount',
      'payable',
      'payReason',
      'transcriptUrl',
      'summaryText'
    ];

    const outLines = [headers.join(',')];
    for (const r of rows || []) {
      const participantRole = String(r.participant_role || '').trim().toLowerCase() || 'supervisee';
      // eslint-disable-next-line no-await-in-loop
      const pay = await resolveSupervisionPayForParticipant({
        agencyId,
        userId: Number(r.user_id),
        participantRole,
        sessionType: String(r.session_type || 'individual'),
        asOfDate: String(r.start_at || '').slice(0, 10)
      });
      const totalSeconds = Number(r.total_seconds || 0);
      const totalHours = Math.round((totalSeconds / 3600) * 100) / 100;
      const rate = Number(pay.rateAmountTotalPerHour || pay.rateAmount || 0);
      const computedAmount = pay.payable ? Math.round(totalHours * rate * 100) / 100 : 0;
      const values = [
        Number(r.session_id || 0),
        String(r.session_type || 'individual'),
        String(r.session_status || ''),
        String(r.participant_name || '').trim(),
        String(r.participant_email || '').trim().toLowerCase(),
        participantRole,
        r.start_at || '',
        r.end_at || '',
        r.first_joined_at || '',
        r.last_left_at || '',
        totalSeconds,
        totalHours,
        Number(r.segment_count || 0),
        Number(r.is_finalized || 0) === 1 ? 'true' : 'false',
        Array.isArray(pay.serviceCodes) ? pay.serviceCodes.join('|') : (pay.serviceCode || ''),
        rate,
        computedAmount,
        pay.payable ? 'true' : 'false',
        pay.reason || '',
        String(r.artifact_transcript_url || '').trim(),
        String(r.artifact_summary_text || '').trim()
      ];
      outLines.push(values.map(csvCell).join(','));
    }

    const filenameStart = startDate || 'all';
    const filenameEnd = endDate || 'all';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="supervision-attendance-${agencyId}-${filenameStart}-to-${filenameEnd}.csv"`);
    res.status(200).send(outLines.join('\n'));
  } catch (e) {
    next(e);
  }
};

export const getSupervisionSessionArtifacts = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });
    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });

    const role = String(req.user?.role || '').toLowerCase();
    if (!canViewSessionArtifacts(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id,
      sessionId: id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    let artifact = await SupervisionSessionArtifact.findBySessionId(id);

    if (artifact && !canViewTranscript(role)) {
      artifact = { ...artifact, transcript_url: null, transcript_text: null };
    }

    // Personal notes are per-user — never return legacy shared private_notes on artifacts.
    if (artifact) {
      artifact = {
        ...artifact,
        private_notes_text: null,
        privateNotesText: null
      };
    }

    const hasTranscriptUrl = !!String(artifact?.transcript_url || '').trim();
    const hasTranscriptText = !!String(artifact?.transcript_text || '').trim();
    const canAttemptAutoPull = !hasTranscriptUrl && !hasTranscriptText
      && (!!String(row.google_meet_link || '').trim() || !!String(row.google_event_id || '').trim());

    if (canAttemptAutoPull) {
      const auto = await fetchMeetTranscriptForSession({
        hostEmail: row.google_host_email,
        meetLink: row.google_meet_link,
        googleEventId: row.google_event_id,
        sessionStartAt: row.start_at
      });
      if (auto?.ok && (String(auto.transcriptUrl || '').trim() || String(auto.transcriptText || '').trim())) {
        artifact = await SupervisionSessionArtifact.upsertBySessionId({
          sessionId: id,
          taggedAt: mysqlNowDateTime(),
          transcriptUrl: auto.transcriptUrl || null,
          transcriptText: auto.transcriptText || null,
          updatedByUserId: Number(req.user?.id || 0) || null
        });
      }
    }

    const payload = artifact
      ? {
        ...artifact,
        transcriptPaused: !!(artifact.transcript_paused === 1 || artifact.transcript_paused === true),
        transcriptStoppedAt: artifact.transcript_stopped_at || null,
        transcriptStoppedByUserId: artifact.transcript_stopped_by_user_id
          ? Number(artifact.transcript_stopped_by_user_id)
          : null,
        transcriptStoppedByName: artifact.transcript_stopped_by_name || null
      }
      : null;

    res.json({ ok: true, sessionId: id, artifact: payload });
  } catch (e) {
    next(e);
  }
};

export const upsertSupervisionSessionArtifacts = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });
    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });

    const role = String(req.user?.role || '').toLowerCase();
    if (!canViewSessionArtifacts(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id,
      sessionId: id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const transcriptUrlInput = req.body?.transcriptUrl;
    const transcriptTextInput = req.body?.transcriptText;
    const summaryTextInput = req.body?.summaryText;
    const autoSummarize = req.body?.autoSummarize === true;
    const focusTitleInput = req.body?.focusTitle ?? req.body?.focus_title;
    const goalsInput = req.body?.goals ?? req.body?.goalsJson ?? req.body?.goals_json;
    const actionItemsInput = req.body?.actionItems ?? req.body?.actionItemsJson ?? req.body?.action_items_json;

    const sessionType = String(row.session_type || 'individual').trim().toLowerCase();
    const isGroupSession = sessionType === 'group' || sessionType === 'triadic';
    if (isGroupSession
      && (goalsInput !== undefined || actionItemsInput !== undefined)
      && !(await canFacilitateSupervisionRow(req, row))) {
      return res.status(403).json({ error: { message: 'Only the facilitator can update session goals or action items.' } });
    }

    const mayEditTranscript = canViewTranscript(role);
    const transcriptUrl = mayEditTranscript && transcriptUrlInput !== undefined
      ? String(transcriptUrlInput || '').trim().slice(0, 2048)
      : undefined;
    const transcriptTextForPrompt = transcriptTextInput !== undefined
      ? String(transcriptTextInput || '').trim().slice(0, 120000)
      : null;
    const transcriptText = mayEditTranscript && transcriptTextInput !== undefined
      ? transcriptTextForPrompt
      : undefined;
    let summaryText = summaryTextInput === undefined ? undefined : String(summaryTextInput || '').trim().slice(0, 120000);
    let summaryModel = undefined;
    let summaryGeneratedAt = undefined;

    if (autoSummarize && !transcriptTextForPrompt) {
      return res.status(400).json({
        error: { message: 'Transcript text is required to generate a summary with Gemini.' }
      });
    }

    if (autoSummarize && transcriptTextForPrompt) {
      const prompt = buildSupervisionSummaryPrompt(transcriptTextForPrompt);
      const summaryResp = await callGeminiText({
        prompt,
        temperature: 0.1,
        maxOutputTokens: 1200
      });
      summaryText = String(summaryResp?.text || '').trim();
      if (!summaryText) {
        return res.status(502).json({
          error: { message: 'Gemini returned an empty summary. Try again with more transcript text.' }
        });
      }
      summaryModel = String(summaryResp?.modelName || '').trim() || null;
      summaryGeneratedAt = mysqlNowDateTime();
    }

    const normalizeChecklist = (raw) => {
      if (raw === undefined) return undefined;
      let list = raw;
      if (typeof list === 'string') {
        try { list = JSON.parse(list || '[]'); } catch { list = []; }
      }
      if (!Array.isArray(list)) return [];
      return list.slice(0, 50).map((item, idx) => ({
        id: String(item?.id || `item-${idx + 1}`).slice(0, 64),
        text: String(item?.text || '').trim().slice(0, 500),
        done: !!item?.done
      })).filter((item) => item.text);
    };

    const focusTitle = focusTitleInput === undefined
      ? undefined
      : String(focusTitleInput || '').trim().slice(0, 500);
    const goals = normalizeChecklist(goalsInput);
    const actionItems = normalizeChecklist(actionItemsInput);
    // privateNotesText is deprecated — personal notes use /personal-note per user.

    let artifact = await SupervisionSessionArtifact.upsertBySessionId({
      sessionId: id,
      taggedAt: mysqlNowDateTime(),
      transcriptUrl,
      transcriptText,
      summaryText,
      summaryModel,
      summaryGeneratedAt,
      focusTitle,
      goals,
      actionItems,
      updatedByUserId: Number(req.user?.id || 0) || null
    });

    if (artifact && !mayEditTranscript) {
      artifact = { ...artifact, transcript_url: null, transcript_text: null };
    }
    if (artifact) {
      artifact = {
        ...artifact,
        private_notes_text: null,
        privateNotesText: null
      };
    }

    res.json({ ok: true, sessionId: id, artifact });
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ error: { message: e.message || 'Failed to save supervision artifacts' } });
    }
    next(e);
  }
};

export const getSupervisionSessionPersonalNote = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userId = Number(req.user?.id || 0);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });

    const role = String(req.user?.role || '').toLowerCase();
    if (!canViewSessionArtifacts(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const saved = await SupervisionSessionPersonalNote.findBySessionAndUser({
      sessionId: id,
      userId
    });

    res.json({
      ok: true,
      sessionId: id,
      note: saved?.noteText || '',
      updatedAt: saved?.updatedAt || null,
      isEncrypted: !!saved?.isEncrypted
    });
  } catch (e) {
    next(e);
  }
};

export const upsertSupervisionSessionPersonalNote = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userId = Number(req.user?.id || 0);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });

    const role = String(req.user?.role || '').toLowerCase();
    if (!canViewSessionArtifacts(role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const noteText = String(
      req.body?.noteText ?? req.body?.note ?? req.body?.notes ?? ''
    ).slice(0, 120000);

    const saved = await SupervisionSessionPersonalNote.upsertBySessionAndUser({
      sessionId: id,
      userId,
      noteText
    });

    res.json({
      ok: true,
      sessionId: id,
      note: saved?.noteText || '',
      updatedAt: saved?.updatedAt || null,
      isEncrypted: !!saved?.isEncrypted
    });
  } catch (e) {
    next(e);
  }
};

export const createSupervisionSessionValidators = [
  body('agencyId').isInt({ min: 1 }).withMessage('agencyId is required'),
  body('supervisorUserId').isInt({ min: 1 }).withMessage('supervisorUserId is required'),
  body('superviseeUserId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('superviseeUserId must be a valid user id'),
  body('enrollmentMode').optional().isIn(['invited', 'open_join', 'signup_only']).withMessage('enrollmentMode must be invited, open_join, or signup_only'),
  body('sessionType').optional().isIn(['individual', 'triadic', 'group']).withMessage('sessionType must be individual, triadic, or group'),
  body('additionalAttendeeUserIds').optional().isArray().withMessage('additionalAttendeeUserIds must be an array'),
  body('additionalAttendeeUserIds.*').optional().isInt({ min: 1 }).withMessage('additionalAttendeeUserIds must contain valid user ids'),
  body('requiredAttendeeUserIds').optional().isArray().withMessage('requiredAttendeeUserIds must be an array'),
  body('requiredAttendeeUserIds.*').optional().isInt({ min: 1 }).withMessage('requiredAttendeeUserIds must contain valid user ids'),
  body('optionalAttendeeUserIds').optional().isArray().withMessage('optionalAttendeeUserIds must be an array'),
  body('optionalAttendeeUserIds.*').optional().isInt({ min: 1 }).withMessage('optionalAttendeeUserIds must contain valid user ids'),
  body('presenterUserIds').optional().isArray().withMessage('presenterUserIds must be an array'),
  body('presenterUserIds.*').optional().isInt({ min: 1 }).withMessage('presenterUserIds must contain valid user ids'),
  body('inviteScope').optional().isIn(['invited_only', 'open_to_all', 'open_and_invited']).withMessage('inviteScope must be invited_only, open_to_all, or open_and_invited'),
  body('inviteAudienceAllSupervised').optional().isBoolean().withMessage('inviteAudienceAllSupervised must be boolean'),
  body('inviteAudienceGroupSupport').optional().isBoolean().withMessage('inviteAudienceGroupSupport must be boolean'),
  body('coFacilitatorUserId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('coFacilitatorUserId must be a valid user id'),
  body('startAt').not().isEmpty().withMessage('startAt is required'),
  body('endAt').not().isEmpty().withMessage('endAt is required'),
  body('createMeetLink').optional().isBoolean().withMessage('createMeetLink must be boolean'),
  body('waitingRoomEnabled').optional().isBoolean().withMessage('waitingRoomEnabled must be boolean')
];

export const patchSupervisionSessionValidators = [
  body('startAt').optional(),
  body('endAt').optional(),
  body('sessionType').optional().isIn(['individual', 'triadic', 'group']).withMessage('sessionType must be individual, triadic, or group'),
  body('presenterUserIds').optional().isArray().withMessage('presenterUserIds must be an array'),
  body('presenterUserIds.*').optional().isInt({ min: 1 }).withMessage('presenterUserIds must contain valid user ids'),
  body('inviteScope').optional().isIn(['invited_only', 'open_to_all', 'open_and_invited']).withMessage('inviteScope must be invited_only, open_to_all, or open_and_invited'),
  body('inviteAudienceAllSupervised').optional().isBoolean().withMessage('inviteAudienceAllSupervised must be boolean'),
  body('inviteAudienceGroupSupport').optional().isBoolean().withMessage('inviteAudienceGroupSupport must be boolean'),
  body('coFacilitatorUserId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('coFacilitatorUserId must be a valid user id'),
  body('notes').optional(),
  body('modality').optional(),
  body('locationText').optional(),
  body('createMeetLink').optional().isBoolean().withMessage('createMeetLink must be boolean'),
  body('waitingRoomEnabled').optional().isBoolean().withMessage('waitingRoomEnabled must be boolean'),
  body('notifyParticipants').optional().isBoolean().withMessage('notifyParticipants must be boolean')
];

export const createSupervisionSession = async (req, res, next) => {
  try {
    if (!requireValid(req, res)) return;
    const agencyId = parseInt(req.body?.agencyId, 10);
    const enrollmentMode = String(req.body?.enrollmentMode || 'invited').trim().toLowerCase();
    const isSignupOnly = isSignupOnlyEnrollment(enrollmentMode);
    const supervisorUserId = parseInt(req.body?.supervisorUserId, 10);
    const superviseeUserIdRaw = parseInt(req.body?.superviseeUserId, 10);
    const superviseeUserId = isSignupOnly
      ? (Number.isFinite(superviseeUserIdRaw) && superviseeUserIdRaw > 0 ? superviseeUserIdRaw : supervisorUserId)
      : superviseeUserIdRaw;
    const startWall = parseDateTimeLocalString(req.body?.startAt);
    const endWall = parseDateTimeLocalString(req.body?.endAt);
    const supervisionTimeZone = String(req.body?.timeZone || DEFAULT_SCHEDULE_TZ).trim() || DEFAULT_SCHEDULE_TZ;
    const { startAt, endAt } = wallStartEndToUtcMysql(startWall, endWall, supervisionTimeZone);
    const sessionType = String(req.body?.sessionType || 'individual').trim().toLowerCase();
    const inviteAudienceAllSupervised = req.body?.inviteAudienceAllSupervised === true;
    const inviteAudienceGroupSupport = req.body?.inviteAudienceGroupSupport === true;
    const coFacilitatorUserIdRaw = req.body?.coFacilitatorUserId == null || req.body?.coFacilitatorUserId === ''
      ? null
      : parseInt(req.body.coFacilitatorUserId, 10);
    const coFacilitatorUserId = Number.isFinite(coFacilitatorUserIdRaw) && coFacilitatorUserIdRaw > 0
      && coFacilitatorUserIdRaw !== supervisorUserId
      ? coFacilitatorUserIdRaw
      : null;
    const modality = req.body?.modality ?? null;
    const locationText = req.body?.locationText ?? null;
    const notes = req.body?.notes ?? null;
    const createMeetLink = req.body?.createMeetLink === true;
    const additionalAttendeeUserIds = Array.from(
      new Set(
        (Array.isArray(req.body?.additionalAttendeeUserIds) ? req.body.additionalAttendeeUserIds : [])
          .map((n) => parseInt(n, 10))
          .filter((n) => Number.isFinite(n) && n > 0 && n !== supervisorUserId && n !== superviseeUserId)
      )
    );
    const requiredAttendeeUserIds = Array.from(
      new Set(
        (Array.isArray(req.body?.requiredAttendeeUserIds) ? req.body.requiredAttendeeUserIds : [])
          .map((n) => parseInt(n, 10))
          .filter((n) => Number.isFinite(n) && n > 0 && n !== supervisorUserId)
      )
    );
    const optionalAttendeeUserIds = Array.from(
      new Set(
        (Array.isArray(req.body?.optionalAttendeeUserIds) ? req.body.optionalAttendeeUserIds : [])
          .map((n) => parseInt(n, 10))
          .filter((n) => Number.isFinite(n) && n > 0 && n !== supervisorUserId && n !== superviseeUserId)
      )
    );
    const presenterUserIds = Array.from(
      new Set(
        (Array.isArray(req.body?.presenterUserIds) ? req.body.presenterUserIds : [])
          .map((n) => parseInt(n, 10))
          .filter((n) => Number.isFinite(n) && n > 0 && n !== supervisorUserId)
      )
    ).slice(0, 2);

    if (!startWall || !endWall || !startAt || !endAt) {
      return res.status(400).json({ error: { message: 'Invalid startAt/endAt' } });
    }
    if (endAt <= startAt) return res.status(400).json({ error: { message: 'endAt must be after startAt' } });
    if (!isSignupOnly && (!Number.isFinite(superviseeUserId) || superviseeUserId <= 0)) {
      return res.status(400).json({ error: { message: 'superviseeUserId is required' } });
    }
    if (isSignupOnly && sessionType !== 'group') {
      return res.status(400).json({ error: { message: 'Signup-only supervision must be a group session' } });
    }

    const ok = await canScheduleSession(req, { agencyId, supervisorUserId, superviseeUserId });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    if (!(await assertCanManageGroupSupervision(req, res, { sessionType }))) return;

    const { supOk, svOk } = await requireUsersInAgency({ agencyId, supervisorUserId, superviseeUserId });
    if (!supOk) return res.status(400).json({ error: { message: 'Supervisor does not belong to this agency' } });
    if (!isSignupOnly && !svOk) return res.status(400).json({ error: { message: 'Supervisee does not belong to this agency' } });
    if (coFacilitatorUserId) {
      const coMap = await getUsersInAgencyMap({ agencyId, userIds: [coFacilitatorUserId] });
      if (!coMap[coFacilitatorUserId]) {
        return res.status(400).json({ error: { message: 'Co-facilitator does not belong to this agency' } });
      }
    }
    const allExtraAttendees = Array.from(new Set([
      ...additionalAttendeeUserIds,
      ...requiredAttendeeUserIds,
      ...optionalAttendeeUserIds
    ]));
    if (allExtraAttendees.length) {
      const agencyMap = await getUsersInAgencyMap({ agencyId, userIds: allExtraAttendees });
      const missing = allExtraAttendees.filter((uid) => !agencyMap[uid]);
      if (missing.length) {
        return res.status(400).json({ error: { message: 'One or more additional attendees do not belong to this agency', userIds: missing } });
      }
    }

    const supervisor = await User.findById(supervisorUserId);
    const supervisee = isSignupOnly ? supervisor : await User.findById(superviseeUserId);
    if (!supervisor || (!isSignupOnly && !supervisee)) return res.status(404).json({ error: { message: 'User not found' } });

    const signupClosesAt = isSignupOnly ? signupClosesAtFromUtcStart(startAt) : null;

    const recurrenceSeriesIdRaw = String(req.body?.recurrenceSeriesId || '').trim();
    const recurrenceSeriesId = recurrenceSeriesIdRaw ? recurrenceSeriesIdRaw.slice(0, 64) : null;
    const recurrenceFrequency = String(req.body?.recurrenceFrequency || '').trim().toUpperCase() || null;
    const recurrenceIndex = req.body?.recurrenceIndex == null
      ? null
      : Math.max(0, parseInt(req.body.recurrenceIndex, 10) || 0);

    const hasNamedInvites = additionalAttendeeUserIds.length > 0
      || requiredAttendeeUserIds.length > 0
      || optionalAttendeeUserIds.length > 0;
    const inviteScope = req.body?.inviteScope !== undefined
      ? normalizeInviteScope(req.body.inviteScope)
      : deriveInviteScope({
        audienceAllSupervised: inviteAudienceAllSupervised,
        audienceGroupSupport: inviteAudienceGroupSupport,
        hasNamedInvites
      });

    const waitingRoomEnabled = req.body?.waitingRoomEnabled !== false;
    const notifyParticipants = !(
      req.body?.notifyParticipants === false
      || req.body?.notifyParticipants === 0
      || req.body?.notifyParticipants === '0'
      || req.body?.notifyParticipants === 'false'
      || req.body?.sendCalendarInvites === false
      || req.body?.sendCalendarInvites === 0
      || req.body?.sendCalendarInvites === '0'
      || req.body?.sendCalendarInvites === 'false'
    );
    const created = await SupervisionSession.create({
      agencyId,
      supervisorUserId,
      coFacilitatorUserId,
      superviseeUserId,
      sessionType,
      inviteScope,
      inviteAudienceAllSupervised,
      inviteAudienceGroupSupport,
      startAt,
      endAt,
      modality: modality ? String(modality) : null,
      locationText: locationText ? String(locationText) : null,
      notes: notes ? String(notes) : null,
      createdByUserId: req.user.id,
      waitingRoomEnabled,
      notifyParticipants,
      recurrenceSeriesId,
      recurrenceFrequency,
      recurrenceIndex,
      enrollmentMode: isSignupOnly ? 'signup_only' : enrollmentMode,
      signupClosesAt,
      autoCancelIfEmpty: isSignupOnly
    });

    // Ensure newly scheduled sessions immediately appear in supervision rosters.
    if (!isSignupOnly) {
      await SupervisorAssignment.ensure(
        supervisorUserId,
        superviseeUserId,
        agencyId,
        req.user.id,
        { isPrimary: false }
      );
    }

    if (isSignupOnly) {
      await SupervisionSession.upsertAttendees(created.id, [
        {
          userId: supervisorUserId,
          participantRole: 'supervisor',
          isRequired: true,
          isCompensableSnapshot: false,
          status: 'INVITED'
        },
        ...(coFacilitatorUserId ? [{
          userId: coFacilitatorUserId,
          participantRole: 'co_facilitator',
          isRequired: true,
          isCompensableSnapshot: false,
          status: 'INVITED'
        }] : [])
      ]);
    } else {
    const isGroupSession = String(sessionType || '').trim().toLowerCase() === 'group';
    const allSuperviseeIds = Array.from(new Set([
      superviseeUserId,
      ...additionalAttendeeUserIds,
      ...optionalAttendeeUserIds,
      ...requiredAttendeeUserIds
    ]));
    let requiredSet;
    let optionalSet;
    if (isGroupSession) {
      requiredSet = new Set(
        requiredAttendeeUserIds.filter((uid) => allSuperviseeIds.includes(uid))
      );
      optionalSet = new Set(allSuperviseeIds.filter((uid) => !requiredSet.has(uid)));
    } else {
      requiredSet = new Set([superviseeUserId, ...additionalAttendeeUserIds, ...requiredAttendeeUserIds]);
      optionalSet = new Set(optionalAttendeeUserIds.filter((uid) => !requiredSet.has(uid)));
    }
    const superviseeIds = Array.from(new Set([...requiredSet, ...optionalSet]));
    const validPresenterIds = presenterUserIds.filter((uid) => superviseeIds.includes(uid) || uid === superviseeUserId);
    const compensableMap = await User.getAgencySupervisionCompensableMap(agencyId, superviseeIds);
    await SupervisionSession.upsertAttendees(created.id, [
      {
        userId: supervisorUserId,
        participantRole: 'supervisor',
        isRequired: true,
        isCompensableSnapshot: false,
        status: 'INVITED'
      },
      ...(coFacilitatorUserId ? [{
        userId: coFacilitatorUserId,
        participantRole: 'co_facilitator',
        isRequired: true,
        isCompensableSnapshot: false,
        status: 'INVITED'
      }] : []),
      ...superviseeIds.map((uid) => {
        const isRequired = requiredSet.has(uid);
        const isPresenter = validPresenterIds.includes(uid);
        const profileCompensable = !!compensableMap[uid];
        const isCompensableSnapshot = profileCompensable && (
          !isGroupSession || isRequired || isPresenter
        );
        return {
          userId: uid,
          participantRole: 'supervisee',
          isRequired,
          isCompensableSnapshot,
          status: 'INVITED'
        };
      })
    ]);
    await SupervisionSession.setPresenters({
      sessionId: created.id,
      presenterUserIds: validPresenterIds,
      assignedByUserId: req.user.id
    });
    try {
      await SupervisionCasePresentation.ensureForPresenters({
        sessionId: created.id,
        presenterUserIds: validPresenterIds,
        createdByUserId: req.user.id
      });
    } catch (presErr) {
      console.warn('[supervision] Failed to seed case presentations:', presErr?.message || presErr);
    }

    // Notify counterparts so their schedule can refresh / toast.
    if (notifyParticipants) {
      try {
        const { createNotificationAndDispatch } = await import('../services/notificationDispatcher.service.js');
        const actorId = Number(req.user?.id || 0);
        const actorName = `${String(req.user?.first_name || req.user?.firstName || '').trim()} ${String(req.user?.last_name || req.user?.lastName || '').trim()}`.trim()
          || 'A teammate';
        const whenLabel = String(startAt || '').replace(' ', ' · ').slice(0, 16);
        const recipientIds = Array.from(new Set([
          supervisorUserId,
          superviseeUserId,
          ...(coFacilitatorUserId ? [coFacilitatorUserId] : []),
          ...superviseeIds
        ].filter((uid) => Number(uid) > 0 && Number(uid) !== actorId)));
        const typeLabel = sessionType === 'group' ? 'Group supervision' : 'Supervision';
        await Promise.all(recipientIds.map((uid) => createNotificationAndDispatch({
          type: 'supervision_session_scheduled',
          severity: 'info',
          title: `${typeLabel} scheduled`,
          message: `${actorName} scheduled ${typeLabel.toLowerCase()} for ${whenLabel}. Open My Schedule to see it.`,
          userId: uid,
          agencyId,
          relatedEntityType: 'supervision_sessions',
          relatedEntityId: Number(created.id),
          actorSource: 'Schedule',
          metadata: {
            sessionId: Number(created.id),
            startAt,
            endAt,
            sessionType,
            refreshSchedule: true
          }
        }).catch((err) => {
          console.warn('[supervision] schedule notify failed', uid, err?.message || err);
          return null;
        })));
      } catch (notifyErr) {
        console.warn('[supervision] schedule notify skipped', notifyErr?.message || notifyErr);
      }
    }
    }

    // Best-effort: sync to Google Calendar on supervisor calendar
    const hostEmail = String(supervisor.email || '').trim().toLowerCase();
    const attendeeEmail = isSignupOnly ? '' : String(supervisee.email || '').trim().toLowerCase();
    const extraAttendeeEmails = [];
    if (!isSignupOnly) {
      for (const uid of allExtraAttendees) {
        // eslint-disable-next-line no-await-in-loop
        const extraUser = await User.findById(uid);
        const email = String(extraUser?.email || '').trim().toLowerCase();
        if (email) extraAttendeeEmails.push(email);
      }
    }
    const participantCount = isSignupOnly ? 0 : (1 + extraAttendeeEmails.length);
    const summary = isSignupOnly
      ? 'Group supervision — signup open'
      : (sessionType === 'group'
        ? `Group supervision (${participantCount})`
        : `Supervision — ${(supervisee.first_name || '').trim()} ${(supervisee.last_name || '').trim()}`.trim());
    const desc = notes ? String(notes) : null;
    const useVideo = isVideoConfigured();
    const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    const appJoinUrl = useVideo ? supervisionAppJoinUrl(created) : null;
    const sync = await GoogleCalendarService.upsertSupervisionSession({
      supervisionSessionId: created.id,
      hostEmail,
      attendeeEmail,
      additionalAttendeeEmails: extraAttendeeEmails,
      startAt,
      endAt,
      timeZone: supervisionTimeZone,
      summary,
      description: desc,
      createMeetLink: useVideo ? false : createMeetLink,
      appJoinUrl,
      sendUpdates: notifyParticipants ? 'all' : 'none'
    });

    if (sync?.ok) {
      await SupervisionSession.setGoogleSync(created.id, {
        hostEmail,
        calendarId: sync.calendarId,
        eventId: sync.googleEventId,
        meetLink: sync.meetLink,
        status: 'SYNCED',
        errorMessage: null
      });
    } else {
      await SupervisionSession.setGoogleSync(created.id, {
        hostEmail,
        calendarId: 'primary',
        eventId: null,
        meetLink: null,
        status: 'FAILED',
        errorMessage: sync?.error || sync?.reason || 'Google sync failed'
      });
    }

    const out = await SupervisionSession.resolveByJoinRef(created.id) || await SupervisionSession.findById(created.id);

    res.status(201).json({
      ok: true,
      session: {
        ...out,
        joinUrl: supervisionAppJoinUrl(out),
        hostJoinUrl: supervisionHostJoinUrl(out),
        participantJoinUrl: supervisionAppJoinUrl(out),
        waitingRoomEnabled: isWaitingRoomEnabled(out)
      }
    });
  } catch (e) {
    next(e);
  }
};

export const patchSupervisionSession = async (req, res, next) => {
  try {
    if (!requireValid(req, res)) return;

    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });

    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });
    if (String(row.status || '').toUpperCase() === 'CANCELLED') {
      return res.status(400).json({ error: { message: 'Cannot edit a cancelled session' } });
    }

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const supervisionTimeZone = String(req.body?.timeZone || DEFAULT_SCHEDULE_TZ).trim() || DEFAULT_SCHEDULE_TZ;
    const startWall = req.body?.startAt !== undefined ? parseDateTimeLocalString(req.body?.startAt) : undefined;
    const endWall = req.body?.endAt !== undefined ? parseDateTimeLocalString(req.body?.endAt) : undefined;
    let startAt;
    let endAt;
    if (startWall !== undefined || endWall !== undefined) {
      const wallStart = startWall !== undefined ? startWall : normalizeWallMysqlDatetime(row.start_at);
      const wallEnd = endWall !== undefined ? endWall : normalizeWallMysqlDatetime(row.end_at);
      // Request body is wall clock; convert to UTC for storage.
      // When only one side changes, convert that side; keep other from DB if body omitted.
      if (startWall !== undefined) {
        startAt = wallMysqlToUtcMysql(startWall, supervisionTimeZone);
      }
      if (endWall !== undefined) {
        endAt = wallMysqlToUtcMysql(endWall, supervisionTimeZone);
      }
      // If client sent ISO-Z already (rare), normalizeWallMysqlDatetime/wallMysql may still work.
      if (startWall !== undefined && !startAt) {
        return res.status(400).json({ error: { message: 'Invalid startAt' } });
      }
      if (endWall !== undefined && !endAt) {
        return res.status(400).json({ error: { message: 'Invalid endAt' } });
      }
      void wallStart;
      void wallEnd;
    }
    const wantsTimeChange = startAt !== undefined || endAt !== undefined;
    if (wantsTimeChange) {
      const actorId = Number(req.user?.id || 0);
      const role = String(req.user?.role || '').toLowerCase();
      const isSupervisorHost = actorId > 0 && actorId === Number(row.supervisor_user_id || 0);
      const privileged = ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(role);
      if (!isSupervisorHost && !privileged) {
        return res.status(403).json({
          error: { message: 'Only the supervisor can change this session’s time' }
        });
      }
    }
    const sessionType = req.body?.sessionType !== undefined ? String(req.body?.sessionType || '').trim().toLowerCase() : undefined;
    if (!(await assertCanManageGroupSupervision(req, res, {
      sessionType,
      existingSessionType: row.session_type
    }))) return;
    const notes = req.body?.notes !== undefined ? (req.body?.notes ? String(req.body.notes) : '') : undefined;
    const modality = req.body?.modality !== undefined ? (req.body?.modality ? String(req.body.modality) : null) : undefined;
    const locationText = req.body?.locationText !== undefined ? (req.body?.locationText ? String(req.body.locationText) : null) : undefined;
    const createMeetLink = req.body?.createMeetLink === true;
    const presenterUserIds = req.body?.presenterUserIds !== undefined
      ? Array.from(
        new Set(
          (Array.isArray(req.body?.presenterUserIds) ? req.body.presenterUserIds : [])
            .map((n) => parseInt(n, 10))
            .filter((n) => Number.isFinite(n) && n > 0 && n !== Number(row.supervisor_user_id))
        )
      ).slice(0, 2)
      : undefined;
    const inviteScope = req.body?.inviteScope !== undefined
      ? normalizeInviteScope(req.body.inviteScope)
      : undefined;
    const inviteAudienceAllSupervised = req.body?.inviteAudienceAllSupervised !== undefined
      ? req.body.inviteAudienceAllSupervised === true
      : undefined;
    const inviteAudienceGroupSupport = req.body?.inviteAudienceGroupSupport !== undefined
      ? req.body.inviteAudienceGroupSupport === true
      : undefined;
    const waitingRoomEnabled = req.body?.waitingRoomEnabled !== undefined
      ? req.body.waitingRoomEnabled === true
      : undefined;
    // Same opt-out semantics as create: only suppress when explicitly falsy.
    const notifyParticipants = !(
      req.body?.notifyParticipants === false
      || req.body?.notifyParticipants === 0
      || req.body?.notifyParticipants === '0'
      || req.body?.notifyParticipants === 'false'
      || req.body?.sendCalendarInvites === false
      || req.body?.sendCalendarInvites === 0
      || req.body?.sendCalendarInvites === '0'
      || req.body?.sendCalendarInvites === 'false'
    );

    const nextStart = startAt !== undefined ? startAt : row.start_at;
    const nextEnd = endAt !== undefined ? endAt : row.end_at;
    if (!nextStart || !nextEnd) return res.status(400).json({ error: { message: 'Invalid startAt/endAt' } });
    if (String(nextEnd) <= String(nextStart)) return res.status(400).json({ error: { message: 'endAt must be after startAt' } });

    const scope = String(req.body?.scope || 'single').trim().toLowerCase();
    if (!['single', 'future'].includes(scope)) {
      return res.status(400).json({ error: { message: 'scope must be single or future' } });
    }

    let rowsToUpdate = [row];
    const seriesId = String(row.recurrence_series_id || '').trim();
    if (scope === 'future') {
      if (!seriesId) {
        return res.status(400).json({ error: { message: 'This session is not part of a recurring series.' } });
      }
      try {
        rowsToUpdate = await SupervisionSession.listActiveSeriesFromPoint({
          recurrenceSeriesId: seriesId,
          fromStartAt: row.start_at || null
        });
      } catch (e) {
        if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
        rowsToUpdate = [row];
      }
      if (!rowsToUpdate.length) rowsToUpdate = [row];
    }

    const { applyClockTimesToOccurrence } = await import('../utils/seriesTimeShift.js');
    const timingChanged = startAt !== undefined || endAt !== undefined;
    let updated = null;

    for (const occ of rowsToUpdate) {
      const occId = Number(occ.id || 0);
      if (!occId) continue;
      let occStart = startAt !== undefined ? startAt : undefined;
      let occEnd = endAt !== undefined ? endAt : undefined;
      if (timingChanged && scope === 'future' && occId !== id) {
        const shifted = applyClockTimesToOccurrence({
          occurrenceStartRaw: occ.start_at,
          newStartRaw: nextStart,
          newEndRaw: nextEnd
        });
        if (!shifted) continue;
        occStart = shifted.startAt;
        occEnd = shifted.endAt;
      } else if (timingChanged && occId === id) {
        occStart = startAt !== undefined ? startAt : undefined;
        occEnd = endAt !== undefined ? endAt : undefined;
      }
      // eslint-disable-next-line no-await-in-loop
      const rowUpdated = await SupervisionSession.updateById(occId, {
        startAt: occStart,
        endAt: occEnd,
        ...(occId === id ? {
          sessionType,
          inviteScope,
          inviteAudienceAllSupervised,
          inviteAudienceGroupSupport,
          notes,
          modality,
          locationText,
          waitingRoomEnabled
        } : {})
      });
      if (occId === id) updated = rowUpdated;
    }
    if (!updated) updated = await SupervisionSession.updateById(id, {
      startAt: startAt !== undefined ? startAt : undefined,
      endAt: endAt !== undefined ? endAt : undefined,
      sessionType,
      inviteScope,
      inviteAudienceAllSupervised,
      inviteAudienceGroupSupport,
      notes,
      modality,
      locationText,
      waitingRoomEnabled
    });

    if (presenterUserIds !== undefined) {
      const attendees = await SupervisionSession.listAttendees(id);
      const allowed = new Set((attendees || []).filter((a) => String(a?.participant_role || '') === 'supervisee').map((a) => Number(a.user_id)));
      if (Number(row.supervisee_user_id || 0)) allowed.add(Number(row.supervisee_user_id));
      const validPresenterIds = presenterUserIds.filter((uid) => allowed.has(uid));
      await SupervisionSession.setPresenters({
        sessionId: id,
        presenterUserIds: validPresenterIds,
        assignedByUserId: req.user.id
      });
      try {
        await SupervisionCasePresentation.ensureForPresenters({
          sessionId: id,
          presenterUserIds: validPresenterIds,
          createdByUserId: req.user.id
        });
      } catch (presErr) {
        console.warn('[supervision] Failed to seed case presentations:', presErr?.message || presErr);
      }
    }

    // Best-effort: patch/insert Google event on supervisor calendar (keep existing meet link unless requested and missing)
    const supervisor = await User.findById(row.supervisor_user_id);
    const supervisee = await User.findById(row.supervisee_user_id);
    const hostEmail = String(row.google_host_email || supervisor?.email || '').trim().toLowerCase();
    const attendeeEmail = String(supervisee?.email || '').trim().toLowerCase();

    const summary = `Supervision — ${(supervisee?.first_name || '').trim()} ${(supervisee?.last_name || '').trim()}`.trim();
    const useVideo = isVideoConfigured();

    for (const occ of rowsToUpdate) {
      const occId = Number(occ.id || 0);
      if (!occId) continue;
      // eslint-disable-next-line no-await-in-loop
      const fresh = await SupervisionSession.findById(occId);
      if (!fresh) continue;
      const desc = fresh?.notes ? String(fresh.notes) : null;
      const appJoinUrl = useVideo ? supervisionAppJoinUrl(fresh) : null;
      // eslint-disable-next-line no-await-in-loop
      const sync = await GoogleCalendarService.upsertSupervisionSession({
        supervisionSessionId: occId,
        hostEmail,
        attendeeEmail,
        startAt: fresh.start_at,
        endAt: fresh.end_at,
        timeZone: supervisionTimeZone,
        summary,
        description: desc,
        createMeetLink: useVideo ? false : (occId === id && createMeetLink && !String(fresh.google_meet_link || '').trim()),
        appJoinUrl,
        existingGoogleEventId: fresh.google_event_id || null,
        existingMeetLink: fresh.google_meet_link || null,
        sendUpdates: notifyParticipants ? 'all' : 'none'
      });

      if (sync?.ok) {
        // eslint-disable-next-line no-await-in-loop
        await SupervisionSession.setGoogleSync(occId, {
          hostEmail,
          calendarId: sync.calendarId,
          eventId: sync.googleEventId,
          meetLink: sync.meetLink || fresh.google_meet_link || null,
          status: 'SYNCED',
          errorMessage: null
        });
      } else {
        // eslint-disable-next-line no-await-in-loop
        await SupervisionSession.setGoogleSync(occId, {
          hostEmail,
          calendarId: fresh.google_calendar_id || 'primary',
          eventId: fresh.google_event_id || null,
          meetLink: fresh.google_meet_link || null,
          status: 'FAILED',
          errorMessage: sync?.error || sync?.reason || 'Google sync failed'
        });
      }
    }

    const out = await SupervisionSession.findById(id);
    res.json({ ok: true, session: out });
  } catch (e) {
    next(e);
  }
};

export const cancelSupervisionSession = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });

    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });

    const actorId = Number(req.user?.id || 0);
    if (!actorId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    const role = String(req.user?.role || '').toLowerCase();
    const isHost = actorId === Number(row.supervisor_user_id || 0);
    const isAdminLike = ['super_admin', 'admin', 'support', 'clinical_practice_assistant'].includes(role);
    // Presenters / supervisees / co-facilitators must not cancel — host or admin only.
    if (!isHost && !isAdminLike) {
      return res.status(403).json({ error: { message: 'Only the host or an admin can cancel this session' } });
    }
    if (isAdminLike && !isHost) {
      const actorAgencies = await User.getAgencies(actorId);
      const inAgency = (actorAgencies || []).some((a) => Number(a?.id) === Number(row.agency_id));
      if (!inAgency && role !== 'super_admin') {
        return res.status(403).json({ error: { message: 'Access denied for this agency' } });
      }
    }

    const cancelled = await SupervisionSession.cancel(id);

    // Only suppress the cancellation email when explicitly opted out — default stays 'send'.
    const notifyRaw = req.body?.notifyParticipants;
    const notifyParticipants = !(
      notifyRaw === false || notifyRaw === 0 || notifyRaw === '0' || notifyRaw === 'false'
    );

    // Best-effort delete in Google
    const hostEmail = String(row.google_host_email || '').trim() || (await User.findById(row.supervisor_user_id))?.email;
    if (hostEmail && row.google_event_id) {
      await GoogleCalendarService.cancelSupervisionSessionGoogleEvent({
        hostEmail,
        googleEventId: row.google_event_id,
        sendUpdates: notifyParticipants ? 'all' : 'none'
      });
    }

    res.json({ ok: true, session: cancelled });
  } catch (e) {
    next(e);
  }
};

/**
 * Get supervision hours summary for a supervisee. Supervisor or admin/support only.
 * GET /supervision/supervisee/:superviseeId/hours-summary?agencyId=...
 */
export const getSuperviseeHoursSummary = async (req, res, next) => {
  try {
    const requesterId = Number(req.user?.id || 0);
    const superviseeId = req.params.superviseeId ? parseInt(req.params.superviseeId, 10) : null;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!requesterId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!superviseeId) return res.status(400).json({ error: { message: 'superviseeId is required' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    if (requesterId !== superviseeId) {
      const role = String(req.user?.role || '').toLowerCase();
      const isAdminOrSupport = role === 'admin' || role === 'super_admin' || role === 'support';
      if (!isAdminOrSupport) {
        const hasAccess = await User.supervisorHasAccess(requesterId, superviseeId, agencyId);
        if (!hasAccess) {
          return res.status(403).json({ error: { message: 'Access denied. You can only view hours for your assigned supervisees.' } });
        }
      }
    }
    await autoFinalizeOverdueSessions({ agencyId, actorUserId: requesterId });

    const summary = await SupervisionSession.getHoursSummaryForSupervisee(agencyId, superviseeId);

    // Recent finalized sessions with hoursBefore / hoursAttended / hoursAfter snapshots.
    let recentSessions = [];
    try {
      const [creditRows] = await pool.execute(
        `SELECT
           sshc.session_id,
           sshc.individual_hours,
           sshc.group_hours,
           sshc.total_seconds,
           sshc.source_json,
           ss.start_at,
           ss.end_at,
           ss.session_type,
           ss.status,
           ss.finalized_at
         FROM supervision_session_hour_credits sshc
         JOIN supervision_sessions ss ON ss.id = sshc.session_id
         WHERE sshc.agency_id = ?
           AND sshc.user_id = ?
         ORDER BY COALESCE(ss.finalized_at, ss.start_at) DESC
         LIMIT 20`,
        [agencyId, superviseeId]
      );
      recentSessions = (creditRows || []).map((r) => {
        let src = r.source_json;
        if (typeof src === 'string') {
          try { src = JSON.parse(src); } catch { src = {}; }
        }
        if (!src || typeof src !== 'object') src = {};
        const attended = Number(src.hoursAttended);
        const before = Number(src.hoursBefore);
        const after = Number(src.hoursAfter);
        const fallbackAttended = Math.round(
          ((Number(r.individual_hours || 0) + Number(r.group_hours || 0)) || (Number(r.total_seconds || 0) / 3600)) * 100
        ) / 100;
        return {
          sessionId: Number(r.session_id),
          startAt: r.start_at || null,
          endAt: r.end_at || null,
          sessionType: r.session_type || null,
          status: r.status || null,
          finalizedAt: r.finalized_at || null,
          hoursBefore: Number.isFinite(before) ? before : null,
          hoursAttended: Number.isFinite(attended) ? attended : fallbackAttended,
          hoursAfter: Number.isFinite(after) ? after : null
        };
      });
    } catch {
      recentSessions = [];
    }

    res.json({
      ok: true,
      agencyId,
      superviseeId,
      totalHours: summary.totalHours,
      totalSeconds: summary.totalSeconds,
      sessionCount: summary.sessionCount,
      recentSessions
    });
  } catch (e) {
    next(e);
  }
};

export const getMySupervisionPrompts = async (req, res, next) => {
  try {
    const userId = Number(req.user?.id || 0);
    const agencyId = req.query?.agencyId ? Number(req.query.agencyId) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const now = new Date();
    const rows = await SupervisionSession.listPromptSessionsForUser({
      userId,
      agencyId: Number.isFinite(agencyId) && agencyId > 0 ? agencyId : null,
      now
    });

    const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    const useAppJoin = isVideoConfigured() && frontendUrl;

    const prompts = (rows || []).map((row) => {
      const start = new Date(row.startAt || 0);
      const end = new Date(row.endAt || 0);
      const startsInMinutes = Number.isFinite(start.getTime())
        ? Math.round((start.getTime() - now.getTime()) / 60000)
        : null;
      const inPromptWindow = Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
        ? now >= new Date(start.getTime() - 5 * 60 * 1000) && now <= end
        : false;
      return {
        ...row,
        joinUrl: useAppJoin && row.id ? supervisionAppJoinUrl(row) : null,
        startsInMinutes,
        isLive: Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) ? now >= start && now <= end : false,
        inPromptWindow,
        promptStyle: row.isRequired ? 'required_splash' : 'optional_card'
      };
    }).filter((row) => row.inPromptWindow);

    res.json({ ok: true, prompts, now: now.toISOString() });
  } catch (e) {
    next(e);
  }
};

async function repairInflatedSessionAttendance(sessions, { userId } = {}) {
  const uid = Number(userId || 0);
  if (!uid || !Array.isArray(sessions) || !sessions.length) return false;
  let repaired = false;
  const { resyncFinalizedSessionHourCredits } = await import('../services/supervisionFinalizePipeline.service.js');

  for (const s of sessions) {
    const sid = Number(s?.id || 0);
    if (!sid) continue;
    let totalSeconds = Number(s?.totalSeconds || 0);
    const startMs = parseAsDate(s.startAt)?.getTime();
    const endMs = parseAsDate(s.endAt)?.getTime();
    const scheduledSeconds = (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs)
      ? Math.round((endMs - startMs) / 1000)
      : 3600;
    const status = String(s.status || '').toUpperCase();
    const absurd = totalSeconds > 8 * 3600 || totalSeconds > Math.max(scheduledSeconds * 3, 3 * 3600);
    if (absurd && totalSeconds > 0) {
      // eslint-disable-next-line no-await-in-loop
      const fixed = await recomputeAttendanceRollupForUser({
        sessionId: sid,
        userId: uid,
        closeOpenAt: s.endAt || null,
        forceFinalize: ['FINALIZED', 'MISSED'].includes(status),
        sessionStartAt: s.startAt || s.start_at || null
      });
      totalSeconds = Number(fixed?.totalSeconds || 0);
      repaired = true;
    }

    // Re-sync requirement hour credits when they disagree with attendance
    // (fixes inflated credits that were written before attendance repair).
    if (status === 'FINALIZED') {
      try {
        const [credRows] = await pool.execute(
          `SELECT individual_hours, group_hours, total_seconds
           FROM supervision_session_hour_credits
           WHERE session_id = ? AND user_id = ?
           LIMIT 1`,
          [sid, uid]
        );
        const credit = credRows?.[0] || null;
        const creditHrs = Number(credit?.individual_hours || 0) + Number(credit?.group_hours || 0);
        const rollupHrs = Math.round((Math.min(totalSeconds, 8 * 3600) / 3600) * 100) / 100;
        const mismatch = credit
          ? Math.abs(creditHrs - rollupHrs) > 0.02
          : rollupHrs > 0.02;
        if (mismatch) {
          // eslint-disable-next-line no-await-in-loop
          await resyncFinalizedSessionHourCredits({ sessionId: sid });
          repaired = true;
        }
      } catch (e) {
        if (!/supervision_session_hour_credits/i.test(String(e?.message || ''))) {
          console.warn('[supervision] hour credit resync failed', sid, e?.message || e);
        }
      }
    }
  }
  return repaired;
}

export const getMySupervisionSessions = async (req, res, next) => {
  try {
    const userId = Number(req.user?.id || 0);
    const agencyId = req.query?.agencyId ? Number(req.query.agencyId) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    await autoFinalizeOverdueSessions({ agencyId, actorUserId: userId });

    const aId = Number.isFinite(agencyId) && agencyId > 0 ? agencyId : null;
    let asSupervisee = await SupervisionSession.listSessionsForSuperviseeWithArtifacts({
      superviseeUserId: userId,
      agencyId: aId,
      limit: 50
    });
    if (await repairInflatedSessionAttendance(asSupervisee, { userId })) {
      asSupervisee = await SupervisionSession.listSessionsForSuperviseeWithArtifacts({
        superviseeUserId: userId,
        agencyId: aId,
        limit: 50
      });
    }
    let asSupervisor = await SupervisionSession.listSessionsForSupervisorWithArtifacts({
      supervisorUserId: userId,
      agencyId: aId,
      limit: 50
    });
    if (await repairInflatedSessionAttendance(asSupervisor, { userId })) {
      asSupervisor = await SupervisionSession.listSessionsForSupervisorWithArtifacts({
        supervisorUserId: userId,
        agencyId: aId,
        limit: 50
      });
    }

    const byId = new Map();
    for (const s of asSupervisee || []) {
      byId.set(Number(s.id), { ...s, role: s.role || 'supervisee' });
    }
    for (const s of asSupervisor || []) {
      const id = Number(s.id);
      if (!byId.has(id)) byId.set(id, { ...s, role: 'supervisor' });
      else byId.set(id, { ...byId.get(id), role: 'both', superviseeName: s.superviseeName || byId.get(id).superviseeName });
    }
    const sessions = Array.from(byId.values()).sort((a, b) => {
      const ta = new Date(a.startAt || 0).getTime();
      const tb = new Date(b.startAt || 0).getTime();
      return tb - ta;
    }).slice(0, 75);

    const role = String(req.user?.role || '').toLowerCase();
    const includeTranscript = canViewTranscript(role);
    const sanitized = (sessions || []).map((s) => {
      const out = { ...s };
      if (!includeTranscript) out.transcriptText = null;
      return out;
    });

    const withJoinUrl = sanitized.map((s) => ({
      ...s,
      joinUrl: supervisionAppJoinUrl(s),
      participantJoinUrl: supervisionAppJoinUrl(s),
      hostJoinUrl: supervisionHostJoinUrl(s),
      waitingRoomEnabled: isWaitingRoomEnabled(s)
    }));

    res.json({ ok: true, sessions: withJoinUrl });
  } catch (e) {
    next(e);
  }
};

export const getSuperviseeSessions = async (req, res, next) => {
  try {
    const superviseeId = parseInt(req.params.superviseeId, 10);
    const agencyId = req.query?.agencyId ? Number(req.query.agencyId) : null;
    const actorId = Number(req.user?.id || 0);
    if (!actorId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!superviseeId) return res.status(400).json({ error: { message: 'Invalid supervisee id' } });

    const role = String(req.user?.role || '').toLowerCase();
    const aId = Number.isFinite(agencyId) && agencyId > 0 ? agencyId : null;

    if (role !== 'super_admin' && role !== 'admin' && role !== 'support' && role !== 'staff' && role !== 'clinical_practice_assistant') {
      const [rows] = await pool.execute(
        `SELECT agency_id FROM supervision_sessions
         WHERE supervisee_user_id = ? OR EXISTS (
           SELECT 1 FROM supervision_session_attendees ssa
           WHERE ssa.session_id = supervision_sessions.id AND ssa.user_id = ? AND ssa.participant_role = 'supervisee'
         )
         LIMIT 1`,
        [superviseeId, superviseeId]
      );
      const agencyIdFromSession = rows?.[0]?.agency_id;
      const checkAgencyId = aId || Number(agencyIdFromSession || 0);
      const ok = await canScheduleSession(req, {
        agencyId: checkAgencyId || 1,
        supervisorUserId: 0,
        superviseeUserId: superviseeId
      });
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }
    await autoFinalizeOverdueSessions({ agencyId: aId, actorUserId: actorId });

    let sessions = await SupervisionSession.listSessionsForSuperviseeWithArtifacts({
      superviseeUserId: superviseeId,
      agencyId: aId,
      limit: 50
    });
    if (await repairInflatedSessionAttendance(sessions, { userId: superviseeId })) {
      sessions = await SupervisionSession.listSessionsForSuperviseeWithArtifacts({
        superviseeUserId: superviseeId,
        agencyId: aId,
        limit: 50
      });
    }

    const includeTranscript = canViewTranscript(role);
    const sanitized = (sessions || []).map((s) => {
      const out = { ...s };
      if (!includeTranscript) out.transcriptText = null;
      return out;
    });

    const withJoinUrl = sanitized.map((s) => ({
      ...s,
      joinUrl: supervisionAppJoinUrl(s),
      participantJoinUrl: supervisionAppJoinUrl(s),
      hostJoinUrl: supervisionHostJoinUrl(s),
      waitingRoomEnabled: isWaitingRoomEnabled(s)
    }));

    res.json({ ok: true, sessions: withJoinUrl });
  } catch (e) {
    next(e);
  }
};

export const getMyPresenterAssignments = async (req, res, next) => {
  try {
    const userId = Number(req.user?.id || 0);
    const agencyId = req.query?.agencyId ? Number(req.query.agencyId) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const now = new Date();
    const rows = await SupervisionSession.listPresenterAssignmentsForUser({
      userId,
      agencyId: Number.isFinite(agencyId) && agencyId > 0 ? agencyId : null,
      now
    });

    const out = [];
    for (const row of rows || []) {
      await SupervisionSession.ensurePresenterReminders({
        presenterAssignmentId: row.presenter_assignment_id,
        userId,
        agencyId: row.agency_id,
        sessionId: row.session_id,
        sessionType: row.session_type,
        supervisorName: row.supervisor_name,
        startAt: row.start_at,
        now
      });
      const start = new Date(row.start_at || 0);
      const startsInMinutes = Number.isFinite(start.getTime())
        ? Math.round((start.getTime() - now.getTime()) / 60000)
        : null;
      out.push({
        presenterAssignmentId: Number(row.presenter_assignment_id),
        sessionId: Number(row.session_id),
        agencyId: Number(row.agency_id),
        sessionType: String(row.session_type || 'group'),
        presenterRole: String(row.presenter_role || 'primary'),
        presenterStatus: String(row.presenter_status || 'assigned'),
        topicSummary: row.topic_summary || null,
        startAt: row.start_at,
        endAt: row.end_at,
        sessionStatus: row.session_status,
        googleMeetLink: row.google_meet_link || null,
        supervisorName: String(row.supervisor_name || '').trim() || null,
        startsInMinutes,
        reminderStage: startsInMinutes !== null
          ? (startsInMinutes <= 60 ? 'h1' : (startsInMinutes <= (24 * 60) ? 'h24' : (startsInMinutes <= (7 * 24 * 60) ? 'd7' : null)))
          : null
      });
    }

    res.json({ ok: true, assignments: out, now: now.toISOString() });
  } catch (e) {
    next(e);
  }
};

export const getSessionAttendees = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });
    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id,
      sessionId: id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const [attendees, presenters] = await Promise.all([
      SupervisionSession.listAttendees(id),
      SupervisionSession.listPresentersForSession(id)
    ]);
    const presenterIds = new Set(
      (presenters || []).map((p) => Number(p.user_id || p.userId || 0)).filter((n) => n > 0)
    );
    const out = (attendees || []).map((a) => {
      const userId = Number(a.user_id || a.userId || 0);
      const firstName = String(a.first_name || a.firstName || '').trim();
      const lastName = String(a.last_name || a.lastName || '').trim();
      const name = `${firstName} ${lastName}`.trim() || String(a.email || '').trim() || `User #${userId}`;
      return {
        userId,
        firstName,
        lastName,
        email: String(a.email || '').trim() || null,
        name,
        participantRole: String(a.participant_role || a.participantRole || '').trim() || null,
        isRequired: Number(a.is_required || a.isRequired || 0) === 1,
        status: String(a.status || '').trim() || null,
        isPresenter: presenterIds.has(userId)
      };
    });
    res.json({ ok: true, attendees: out });
  } catch (e) {
    next(e);
  }
};

/** PATCH /supervision/sessions/:id/attendees/:userId — flip mandatory/optional for an already-invited attendee. */
export const setSupervisionAttendeeRequired = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userId = parseInt(req.params.userId, 10);
    if (!id || !userId) return res.status(400).json({ error: { message: 'Invalid session or user id' } });

    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });

    const actorUserId = Number(req.user?.id || 0);
    const role = String(req.user?.role || '').toLowerCase();
    const isFacilitator = actorUserId === Number(row.supervisor_user_id || 0)
      || actorUserId === Number(row.co_facilitator_user_id || 0);
    const isPrivileged = isAdminLikeRole(role) || ['support', 'staff', 'clinical_practice_assistant'].includes(role);
    if (!isFacilitator && !isPrivileged) {
      return res.status(403).json({ error: { message: 'Only the facilitator or authorized staff can change attendee status.' } });
    }

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id,
      sessionId: id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const isRequired = req.body?.isRequired !== false;
    const updated = await SupervisionSession.setAttendeeRequired(id, userId, isRequired);
    if (!updated) {
      return res.status(404).json({ error: { message: 'This person is not an invited attendee on this session.' } });
    }
    res.json({ ok: true, userId, isRequired });
  } catch (e) {
    next(e);
  }
};

export const getSessionPresenters = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });
    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });

    const ok = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id
    });
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const presenters = await SupervisionSession.listPresentersForSession(id);
    res.json({ ok: true, presenters });
  } catch (e) {
    next(e);
  }
};

export const markSessionPresenterPresented = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const presenterUserId = parseInt(req.params.userId, 10);
    const presented = req.body?.presented !== false;
    if (!id || !presenterUserId) return res.status(400).json({ error: { message: 'Invalid session/presenter id' } });

    const row = await SupervisionSession.findById(id);
    if (!row) return res.status(404).json({ error: { message: 'Session not found' } });

    const role = String(req.user?.role || '').toLowerCase();
    const actorUserId = Number(req.user?.id || 0);
    const isSupervisorActor = actorUserId === Number(row.supervisor_user_id);
    const isPrivileged = ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant'].includes(role);
    if (!isSupervisorActor && !isPrivileged) {
      return res.status(403).json({ error: { message: 'Only supervisors or authorized staff can mark presenters as presented.' } });
    }

    const okAccess = await canScheduleSession(req, {
      agencyId: row.agency_id,
      supervisorUserId: row.supervisor_user_id,
      superviseeUserId: row.supervisee_user_id
    });
    if (!okAccess) return res.status(403).json({ error: { message: 'Access denied' } });

    const status = presented ? 'presented' : 'assigned';
    const ok = await SupervisionSession.setPresenterStatus({
      sessionId: id,
      userId: presenterUserId,
      status
    });
    if (!ok) return res.status(404).json({ error: { message: 'Presenter assignment not found for this session' } });

    const presenters = await SupervisionSession.listPresentersForSession(id);
    res.json({ ok: true, presenters, status });
  } catch (e) {
    next(e);
  }
};

export const signupForSupervisionSession = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });
    const actorId = Number(req.user?.id || 0);
    if (!actorId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    const { signupForSession } = await import('../services/supervisionSignup.service.js');
    try {
      const result = await signupForSession({ sessionId: id, userId: actorId });
      return res.json({ ok: true, ...result });
    } catch (err) {
      const code = String(err?.code || err?.message || '');
      if (code === 'not_signup_session') return res.status(400).json({ error: { message: 'This session is not open for signup' } });
      if (code === 'signup_closed') return res.status(400).json({ error: { message: 'Signup has closed for this session' } });
      if (code === 'already_signed_up') return res.status(409).json({ error: { message: 'You are already signed up' } });
      if (code === 'not_in_agency') return res.status(403).json({ error: { message: 'You are not a member of this agency' } });
      if (code === 'facilitator') return res.status(400).json({ error: { message: 'Facilitators cannot sign up for their own session' } });
      throw err;
    }
  } catch (e) {
    next(e);
  }
};

export const withdrawFromSupervisionSession = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid session id' } });
    const actorId = Number(req.user?.id || 0);
    if (!actorId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    const { withdrawFromSession } = await import('../services/supervisionSignup.service.js');
    try {
      const result = await withdrawFromSession({ sessionId: id, userId: actorId });
      return res.json({ ok: true, ...result });
    } catch (err) {
      const code = String(err?.code || err?.message || '');
      if (code === 'signup_closed') return res.status(400).json({ error: { message: 'Signup changes are closed for this session' } });
      throw err;
    }
  } catch (e) {
    next(e);
  }
};
