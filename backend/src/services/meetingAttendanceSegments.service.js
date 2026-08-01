/**
 * Payable attendance segments for TEAM_MEETING / HUDDLE.
 * Segments sum leave/rejoin time; clamped to scheduled start through meeting_completed_at.
 */
import pool from '../config/database.js';
import AgencyMeetingAttendanceRollup from '../models/AgencyMeetingAttendanceRollup.model.js';

/** UTC MySQL DATETIME for attendance segments (matches meeting start_at storage). */
function toMysqlWall(d = new Date()) {
  const when = d instanceof Date ? d : new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${when.getUTCFullYear()}-${pad(when.getUTCMonth() + 1)}-${pad(when.getUTCDate())} ${pad(when.getUTCHours())}:${pad(when.getUTCMinutes())}:${pad(when.getUTCSeconds())}`;
}

function parseMysqlDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    // mysql2 returns DATETIME as a Date with wall-clock fields in UTC getters.
    const y = raw.getUTCFullYear();
    const mo = raw.getUTCMonth() + 1;
    const d = raw.getUTCDate();
    const h = raw.getUTCHours();
    const mi = raw.getUTCMinutes();
    const se = raw.getUTCSeconds();
    return {
      ymd: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      hm: `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`,
      date: new Date(y, mo - 1, d, h, mi, se)
    };
  }
  const s = String(raw || '').trim();
  // Prefer ISO (…Z) wall fields via Date UTC getters; else naive local DATETIME.
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return parseMysqlDate(d);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return parseMysqlDate(d);
  }
  return {
    ymd: `${m[1]}-${m[2]}-${m[3]}`,
    hm: `${m[4]}:${m[5]}`,
    date: new Date(
      Number(m[1]), Number(m[2]) - 1, Number(m[3]),
      Number(m[4]), Number(m[5]), Number(m[6] || 0)
    )
  };
}

export const JOIN_PRESENCE_STALE_SECONDS = 45;

function userIdFromJoinIdentity(joinIdentity) {
  const m = /^user-(\d+)$/i.exec(String(joinIdentity || '').trim());
  return m ? Number(m[1]) : 0;
}

export { userIdFromJoinIdentity };

/** Huddles, admin meetings, and town halls always track; general team meetings opt in. */
export function isAttendanceTrackingEnabledForEvent(event) {
  const kind = String(event?.kind || '').toUpperCase();
  if (kind === 'HUDDLE') return true;
  if (kind !== 'TEAM_MEETING') return false;
  const subtype = String(event?.meeting_subtype || 'general').trim().toLowerCase();
  if (subtype === 'admin' || subtype === 'town_hall') return true;
  return Number(event?.attendance_tracking_enabled || 0) === 1;
}

export async function enableAttendanceTrackingForEvent(eventId, { actorUserId = null } = {}) {
  const eid = Number(eventId || 0);
  if (!eid) return { ok: false, error: 'invalid_event' };
  const event = await loadMeetingEvent(eid);
  if (!event) return { ok: false, error: 'event_not_found' };
  const kind = String(event.kind || '').toUpperCase();
  if (kind !== 'TEAM_MEETING' && kind !== 'HUDDLE') {
    return { ok: false, error: 'not_a_meeting' };
  }
  if (isAttendanceTrackingEnabledForEvent(event)) {
    return { ok: true, alreadyEnabled: true, eventId: eid };
  }
  await pool.execute(
    `UPDATE provider_schedule_events
     SET attendance_tracking_enabled = 1,
         updated_by_user_id = COALESCE(?, updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [actorUserId ? Number(actorUserId) : null, eid]
  );
  return { ok: true, enabled: true, eventId: eid };
}

export async function pruneStaleJoinPresenceForEvent(eventId, {
  staleSeconds = JOIN_PRESENCE_STALE_SECONDS
} = {}) {
  const eid = Number(eventId || 0);
  if (!eid) return { pruned: 0 };
  try {
    const [stale] = await pool.execute(
      `SELECT join_identity
       FROM provider_schedule_event_join_presence
       WHERE event_id = ?
         AND left_at IS NULL
         AND last_seen_at < (UTC_TIMESTAMP() - INTERVAL ${Number(staleSeconds)} SECOND)`,
      [eid]
    );
    if (!stale?.length) return { pruned: 0 };
    await pool.execute(
      `UPDATE provider_schedule_event_join_presence
       SET left_at = UTC_TIMESTAMP()
       WHERE event_id = ?
         AND left_at IS NULL
         AND last_seen_at < (UTC_TIMESTAMP() - INTERVAL ${Number(staleSeconds)} SECOND)`,
      [eid]
    );
    for (const row of stale) {
      const identity = String(row.join_identity || '').trim();
      if (!identity) continue;
      // eslint-disable-next-line no-await-in-loop
      await closeAttendanceSegment({ eventId: eid, joinIdentity: identity });
    }
    return { pruned: stale.length };
  } catch {
    return { pruned: 0 };
  }
}

export async function getActivePresenceUserIds(eventId, {
  staleSeconds = JOIN_PRESENCE_STALE_SECONDS
} = {}) {
  const eid = Number(eventId || 0);
  if (!eid) return [];
  const [rows] = await pool.execute(
    `SELECT join_identity
     FROM provider_schedule_event_join_presence
     WHERE event_id = ?
       AND left_at IS NULL
       AND last_seen_at >= (UTC_TIMESTAMP() - INTERVAL ${Number(staleSeconds)} SECOND)`,
    [eid]
  );
  const ids = [];
  for (const row of rows || []) {
    const uid = userIdFromJoinIdentity(row.join_identity);
    if (uid) ids.push(uid);
  }
  return ids;
}

export async function loadJoinPresenceByUser(eventId, {
  staleSeconds = JOIN_PRESENCE_STALE_SECONDS
} = {}) {
  const eid = Number(eventId || 0);
  if (!eid) return new Map();
  const [rows] = await pool.execute(
    `SELECT join_identity, joined_at, last_seen_at, left_at
     FROM provider_schedule_event_join_presence
     WHERE event_id = ?`,
    [eid]
  );
  const out = new Map();
  const staleMs = Number(staleSeconds) * 1000;
  const now = Date.now();
  for (const row of rows || []) {
    const uid = userIdFromJoinIdentity(row.join_identity);
    if (!uid) continue;
    const lastSeen = parseMysqlDate(row.last_seen_at)?.date?.getTime();
    const isFresh = Number.isFinite(lastSeen) && (now - lastSeen) <= staleMs;
    const isPresent = !row.left_at && isFresh;
    out.set(uid, {
      isPresent,
      leftAt: row.left_at || null,
      joinedAt: row.joined_at || null,
      lastSeenAt: row.last_seen_at || null
    });
  }
  return out;
}

/**
 * Keep payable segments aligned with live join presence: close when someone leaves,
 * open when they return, stop accruing while away.
 */
export async function syncAttendanceSegmentsWithPresence(eventId, {
  staleSeconds = JOIN_PRESENCE_STALE_SECONDS
} = {}) {
  const eid = Number(eventId || 0);
  if (!eid) return { ok: false };
  const event = await loadMeetingEvent(eid);
  if (!event || !isAttendanceTrackingEnabledForEvent(event)) {
    return { ok: true, skipped: true, reason: 'tracking_disabled' };
  }
  await pruneStaleJoinPresenceForEvent(eid, { staleSeconds });
  const activeIds = await getActivePresenceUserIds(eid, { staleSeconds });
  const activeSet = new Set(activeIds);
  for (const uid of activeIds) {
    // eslint-disable-next-line no-await-in-loop
    await openAttendanceSegment({
      eventId: eid,
      userId: uid,
      source: 'platform',
      force: true
    });
  }
  const [openRows] = await pool.execute(
    `SELECT DISTINCT user_id
     FROM provider_schedule_event_attendance_segments
     WHERE event_id = ? AND ended_at IS NULL`,
    [eid]
  );
  for (const row of openRows || []) {
    const uid = Number(row.user_id || 0);
    if (uid && !activeSet.has(uid)) {
      // eslint-disable-next-line no-await-in-loop
      await closeAttendanceSegment({ eventId: eid, userId: uid });
    }
  }
  await rebuildAttendanceRollupsFromSegments(eid, { syncClaims: false });
  return { ok: true, activeCount: activeIds.length };
}

export async function loadMeetingEvent(eventId) {
  const eid = Number(eventId || 0);
  if (!eid) return null;
  const [rows] = await pool.execute(
    `SELECT id, agency_id, provider_id, kind, meeting_subtype, start_at, end_at,
            meeting_completed_at, status, google_meet_link, platform_video_link, title,
            attendance_tracking_enabled
     FROM provider_schedule_events
     WHERE id = ?
     LIMIT 1`,
    [eid]
  );
  return rows?.[0] || null;
}

function payableStartMs(event) {
  const start = parseMysqlDate(event?.start_at);
  return start?.date ? start.date.getTime() : null;
}

function payableEndMs(event) {
  const completed = parseMysqlDate(event?.meeting_completed_at);
  if (completed?.date) return completed.date.getTime();
  return null; // open-ended until host completes
}

/**
 * Open a payable segment for a user (idempotent if already open).
 * Clamps start to scheduled start_at. No-op if meeting already completed.
 */
export async function openAttendanceSegment({
  eventId,
  userId,
  joinIdentity = null,
  source = 'platform',
  at = null,
  /** When true, open even slightly before scheduled start (live presence sync). */
  force = false
} = {}) {
  const eid = Number(eventId || 0);
  let uid = Number(userId || 0);
  if (!uid && joinIdentity) uid = userIdFromJoinIdentity(joinIdentity);
  if (!eid || !uid) return { ok: false, skipped: true, error: 'missing_ids' };

  const event = await loadMeetingEvent(eid);
  if (!event) return { ok: false, skipped: true, error: 'event_not_found' };
  if (String(event.status || '').toUpperCase() === 'CANCELLED') {
    return { ok: false, skipped: true, error: 'cancelled' };
  }
  if (event.meeting_completed_at) {
    return { ok: true, skipped: true, error: 'already_completed' };
  }
  if (!isAttendanceTrackingEnabledForEvent(event)) {
    return { ok: true, skipped: true, error: 'tracking_disabled' };
  }

  const now = at instanceof Date ? at : new Date();
  const startMs = payableStartMs(event);
  const nowMs = now.getTime();
  // Before scheduled start: do not open a segment yet (heartbeat can retry later).
  // Allow a 15-minute early window, or force when the caller knows they're live in-room.
  const earlyMs = 15 * 60 * 1000;
  if (!force && startMs != null && nowMs < (startMs - earlyMs)) {
    return { ok: true, skipped: true, error: 'before_start', opensAt: new Date(startMs).toISOString() };
  }

  const [openRows] = await pool.execute(
    `SELECT id FROM provider_schedule_event_attendance_segments
     WHERE event_id = ? AND user_id = ? AND ended_at IS NULL
     ORDER BY id DESC LIMIT 1`,
    [eid, uid]
  );
  if (openRows?.[0]?.id) {
    return { ok: true, skipped: true, segmentId: Number(openRows[0].id), alreadyOpen: true };
  }

  const startedAt = toMysqlWall(now);
  const [result] = await pool.execute(
    `INSERT INTO provider_schedule_event_attendance_segments
      (event_id, user_id, started_at, ended_at, source)
     VALUES (?, ?, ?, NULL, ?)`,
    [eid, uid, startedAt, String(source || 'platform').slice(0, 32)]
  );
  return { ok: true, created: true, segmentId: Number(result?.insertId || 0), userId: uid };
}

/**
 * Close open segment(s) for a user.
 */
export async function closeAttendanceSegment({
  eventId,
  userId,
  joinIdentity = null,
  at = null
} = {}) {
  const eid = Number(eventId || 0);
  let uid = Number(userId || 0);
  if (!uid && joinIdentity) uid = userIdFromJoinIdentity(joinIdentity);
  if (!eid || !uid) return { ok: false, skipped: true, error: 'missing_ids' };

  const event = await loadMeetingEvent(eid);
  const now = at instanceof Date ? at : new Date();
  let endMs = now.getTime();
  const completedMs = payableEndMs(event);
  if (completedMs != null && endMs > completedMs) endMs = completedMs;
  const startMs = payableStartMs(event);
  if (startMs != null && endMs < startMs) {
    // Closed before payable window — discard empty open segments.
    await pool.execute(
      `DELETE FROM provider_schedule_event_attendance_segments
       WHERE event_id = ? AND user_id = ? AND ended_at IS NULL`,
      [eid, uid]
    );
    return { ok: true, deleted: true };
  }

  const endedAt = toMysqlWall(new Date(endMs));
  const [result] = await pool.execute(
    `UPDATE provider_schedule_event_attendance_segments
     SET ended_at = ?
     WHERE event_id = ? AND user_id = ? AND ended_at IS NULL`,
    [endedAt, eid, uid]
  );
  return { ok: true, closed: Number(result?.affectedRows || 0), userId: uid };
}

/**
 * Close all open segments at meeting completion time.
 */
export async function closeAllOpenSegmentsForEvent({ eventId, at = null } = {}) {
  const eid = Number(eventId || 0);
  if (!eid) return { ok: false, closed: 0 };
  const endedAt = toMysqlWall(at instanceof Date ? at : new Date());
  const [result] = await pool.execute(
    `UPDATE provider_schedule_event_attendance_segments
     SET ended_at = ?
     WHERE event_id = ? AND ended_at IS NULL`,
    [endedAt, eid]
  );
  return { ok: true, closed: Number(result?.affectedRows || 0) };
}

/**
 * Sum segment seconds for a user, clamping each segment to [start_at, meeting_completed_at|now].
 */
export function computeSegmentSeconds(segments, event, { asOf = null } = {}) {
  const startMs = payableStartMs(event);
  const completedMs = payableEndMs(event);
  const asOfMs = (asOf instanceof Date ? asOf : new Date()).getTime();
  const hardEnd = completedMs != null ? Math.min(completedMs, asOfMs) : asOfMs;
  let total = 0;
  for (const seg of segments || []) {
    const sParts = parseMysqlDate(seg.started_at);
    const eParts = seg.ended_at ? parseMysqlDate(seg.ended_at) : { date: new Date(asOfMs) };
    const s0 = sParts?.date || null;
    const e0 = eParts?.date || null;
    if (!s0 || !e0) continue;
    let a = s0.getTime();
    let b = e0.getTime();
    if (startMs != null && a < startMs) a = startMs;
    if (b > hardEnd) b = hardEnd;
    if (b > a) total += Math.floor((b - a) / 1000);
  }
  return Math.max(0, total);
}

export async function listSegmentsForEvent(eventId) {
  const eid = Number(eventId || 0);
  if (!eid) return [];
  const [rows] = await pool.execute(
    `SELECT s.*, u.first_name, u.last_name, u.email, u.role
     FROM provider_schedule_event_attendance_segments s
     JOIN users u ON u.id = s.user_id
     WHERE s.event_id = ?
     ORDER BY s.user_id ASC, s.started_at ASC`,
    [eid]
  );
  return rows || [];
}

/**
 * Rebuild agency_meeting_attendance_rollups from segments for an event.
 */
export async function rebuildAttendanceRollupsFromSegments(eventId, { syncClaims = true } = {}) {
  const eid = Number(eventId || 0);
  if (!eid) return { ok: false, users: 0 };
  const event = await loadMeetingEvent(eid);
  if (!event) return { ok: false, users: 0 };

  const segments = await listSegmentsForEvent(eid);
  const byUser = new Map();
  for (const seg of segments) {
    const uid = Number(seg.user_id || 0);
    if (!uid) continue;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push(seg);
  }

  let users = 0;
  for (const [uid, segs] of byUser.entries()) {
    const totalSeconds = computeSegmentSeconds(segs, event);
    // eslint-disable-next-line no-await-in-loop
    await AgencyMeetingAttendanceRollup.upsert({
      eventId: eid,
      userId: uid,
      totalSeconds,
      participantEmail: segs[0]?.email || null
    });
    users += 1;
  }

  if (syncClaims) {
    try {
      const { syncCompensationClaimsForEvent } = await import('./meetingCompensationClaims.service.js');
      await syncCompensationClaimsForEvent({
        eventId: eid,
        event,
        allowScheduledFallback: false
      });
    } catch (e) {
      console.warn('[meetingAttendanceSegments] claim sync failed', e?.message || e);
    }
  }

  return { ok: true, users, participantCount: byUser.size };
}

/**
 * Mark meeting completed: set meeting_completed_at, close segments, rebuild rollups + claims.
 */
export async function completeMeetingSession({
  eventId,
  actorUserId = null
} = {}) {
  const eid = Number(eventId || 0);
  if (!eid) return { ok: false, error: 'invalid_event' };
  const event = await loadMeetingEvent(eid);
  if (!event) return { ok: false, error: 'event_not_found' };
  if (String(event.status || '').toUpperCase() === 'CANCELLED') {
    return { ok: false, error: 'cancelled' };
  }

  const now = new Date();
  if (!event.meeting_completed_at) {
    await pool.execute(
      `UPDATE provider_schedule_events
       SET meeting_completed_at = ?, updated_by_user_id = COALESCE(?, updated_by_user_id)
       WHERE id = ?`,
      [toMysqlWall(now), Number(actorUserId || 0) || null, eid]
    );
  }

  await closeAllOpenSegmentsForEvent({ eventId: eid, at: now });
  // Also mark presence left for everyone still in the room.
  try {
    await pool.execute(
      `UPDATE provider_schedule_event_join_presence
       SET left_at = UTC_TIMESTAMP(), last_seen_at = UTC_TIMESTAMP()
       WHERE event_id = ? AND left_at IS NULL`,
      [eid]
    );
  } catch { /* table may not exist */ }

  const rebuild = await rebuildAttendanceRollupsFromSegments(eid, { syncClaims: true });
  const fresh = await loadMeetingEvent(eid);

  let carryover = null;
  try {
    const { carryForwardTeamMeetingWorkspace } = await import('./meetingWorkspaceCarryover.service.js');
    carryover = await carryForwardTeamMeetingWorkspace({ eventId: eid, actorUserId });
  } catch (e) {
    console.warn('[meetingAttendance] workspace carryover failed', e?.message || e);
  }

  return {
    ok: true,
    eventId: eid,
    meetingCompletedAt: fresh?.meeting_completed_at || toMysqlWall(now),
    rebuild,
    carryover
  };
}

export async function listAttendanceSummary(eventId) {
  const eid = Number(eventId || 0);
  if (!eid) return null;
  const event = await loadMeetingEvent(eid);
  if (!event) return null;

  const segments = await listSegmentsForEvent(eid);
  const byUser = new Map();
  for (const seg of segments) {
    const uid = Number(seg.user_id || 0);
    if (!uid) continue;
    if (!byUser.has(uid)) {
      byUser.set(uid, {
        userId: uid,
        firstName: seg.first_name || '',
        lastName: seg.last_name || '',
        email: seg.email || '',
        role: seg.role || '',
        segments: []
      });
    }
    byUser.get(uid).segments.push(seg);
  }

  // Include invited attendees / host even with 0 seconds.
  try {
    const hostId = Number(event.provider_id || 0);
    if (hostId && !byUser.has(hostId)) {
      const [hostRows] = await pool.execute(
        `SELECT id, first_name, last_name, email, role FROM users WHERE id = ? LIMIT 1`,
        [hostId]
      );
      const h = hostRows?.[0];
      if (h) {
        byUser.set(hostId, {
          userId: hostId,
          firstName: h.first_name || '',
          lastName: h.last_name || '',
          email: h.email || '',
          role: h.role || '',
          segments: []
        });
      }
    }
    const [attRows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role
       FROM provider_schedule_event_attendees a
       JOIN users u ON u.id = a.user_id
       WHERE a.event_id = ?`,
      [eid]
    );
    for (const a of attRows || []) {
      const uid = Number(a.id || 0);
      if (!uid || byUser.has(uid)) continue;
      byUser.set(uid, {
        userId: uid,
        firstName: a.first_name || '',
        lastName: a.last_name || '',
        email: a.email || '',
        role: a.role || '',
        segments: []
      });
    }
  } catch { /* ignore */ }

  const presenceByUser = await loadJoinPresenceByUser(eid);

  const participants = Array.from(byUser.values()).map((p) => {
    const totalSeconds = computeSegmentSeconds(p.segments, event);
    const name = [p.firstName, p.lastName].filter(Boolean).join(' ').trim()
      || p.email
      || `User #${p.userId}`;
    const totalMinutes = Math.round((totalSeconds / 60) * 100) / 100;
    const presence = presenceByUser.get(p.userId) || {};
    return {
      userId: p.userId,
      name,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      role: p.role,
      isHost: Number(p.userId) === Number(event.provider_id || 0),
      totalSeconds,
      totalMinutes,
      segmentCount: (p.segments || []).length,
      isPresent: !!presence.isPresent,
      leftAt: presence.leftAt || null,
      joinedAt: presence.joinedAt || null,
      lastSeenAt: presence.lastSeenAt || null,
      presenceStatus: presence.isPresent ? 'active' : (presence.leftAt ? 'left' : 'away')
    };
  }).sort((a, b) => {
    if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
    return String(a.name).localeCompare(String(b.name));
  });

  const namesCsv = participants.map((p) => p.name).join(', ');
  const namesWithTimeCsv = participants
    .map((p) => `${p.name} (${p.totalMinutes}m)`)
    .join(', ');

  return {
    eventId: eid,
    kind: event.kind,
    meetingSubtype: event.meeting_subtype || 'general',
    attendanceTrackingEnabled: isAttendanceTrackingEnabledForEvent(event),
    meetingCompletedAt: event.meeting_completed_at || null,
    startAt: event.start_at || null,
    endAt: event.end_at || null,
    participants,
    copyNamesCsv: namesCsv,
    copyNamesWithTimeCsv: namesWithTimeCsv
  };
}
