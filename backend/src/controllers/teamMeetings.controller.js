/**
 * Team meeting (TEAM_MEETING / HUDDLE provider_schedule_events) video token,
 * waiting room, and transcript.
 */

import pool from '../config/database.js';
import User from '../models/User.model.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import ProviderScheduleEventArtifact from '../models/ProviderScheduleEventArtifact.model.js';
import { joinUrlForTeamMeeting } from '../utils/joinToken.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import {
  isVideoConfigured,
  createOrGetRoomByUniqueName,
  createAccessTokenAsync,
  completeRoom,
  setHostOnlyRecordingRules,
  setRecordAllRecordingRules,
  resolveVideoProjectId,
  getVideoClientDiagnostics
} from '../services/video.service.js';

const JOIN_PRESENCE_STALE_SECONDS = 45;

function isTruthyFlag(v) {
  return !(v === 0 || v === false || v === '0' || v === 'false');
}

function isWaitingRoomEnabled(eventRow) {
  if (eventRow?.waiting_room_enabled === undefined || eventRow?.waiting_room_enabled === null) {
    return true;
  }
  return isTruthyFlag(eventRow.waiting_room_enabled);
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

async function canAccessTeamMeeting(req, event) {
  const actorId = Number(req.user?.id || 0);
  if (!actorId) return false;

  const agencyId = Number(event?.agency_id || 0);
  const providerId = Number(event?.provider_id || 0);

  if (actorId === providerId) return true;

  const [attendeeRows] = await pool.execute(
    `SELECT 1 FROM provider_schedule_event_attendees
     WHERE event_id = ? AND user_id = ?
     LIMIT 1`,
    [event.id, actorId]
  );
  if (attendeeRows?.length) return true;

  const actorAgencies = await User.getAgencies(actorId);
  const inAgency = (actorAgencies || []).some((a) => Number(a?.id) === agencyId);
  if (!inAgency) return false;

  const role = String(req.user?.role || '').toLowerCase();
  if (['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(role)) {
    return true;
  }

  return false;
}

async function pruneStaleJoinPresence(eventId) {
  const eid = Number(eventId || 0);
  if (!eid) return;
  try {
    // Only clear lobby presence. Do not close attendance segments here —
    // a missed heartbeat while still in the Vonage room was zeroing minutes.
    await pool.execute(
      `UPDATE provider_schedule_event_join_presence
       SET left_at = UTC_TIMESTAMP()
       WHERE event_id = ?
         AND left_at IS NULL
         AND last_seen_at < (UTC_TIMESTAMP() - INTERVAL ${JOIN_PRESENCE_STALE_SECONDS} SECOND)`,
      [eid]
    );
  } catch {
    /* table may not exist yet */
  }
}

async function upsertJoinPresence({ eventId, joinIdentity, displayName, isGuest = false }) {
  const eid = Number(eventId || 0);
  const identity = String(joinIdentity || '').trim();
  if (!eid || !identity) return;
  try {
    await pool.execute(
      `INSERT INTO provider_schedule_event_join_presence
        (event_id, join_identity, display_name, is_guest, joined_at, last_seen_at, left_at)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), NULL)
       ON DUPLICATE KEY UPDATE
         display_name = VALUES(display_name),
         is_guest = VALUES(is_guest),
         last_seen_at = UTC_TIMESTAMP(),
         left_at = NULL`,
      [eid, identity, displayName || null, isGuest ? 1 : 0]
    );
  } catch (e) {
    console.warn('[teamMeeting] join presence upsert failed', e?.message || e);
  }
}

async function markJoinPresenceLeft({ eventId, joinIdentity }) {
  const eid = Number(eventId || 0);
  const identity = String(joinIdentity || '').trim();
  if (!eid || !identity) return;
  try {
    await pool.execute(
      `UPDATE provider_schedule_event_join_presence
       SET left_at = UTC_TIMESTAMP()
       WHERE event_id = ? AND join_identity = ? AND left_at IS NULL`,
      [eid, identity]
    );
  } catch {
    /* ignore */
  }
}

async function isUserAdmitted({ eventId, userId = null, joinIdentity = null }) {
  const eid = Number(eventId || 0);
  if (!eid) return false;
  const uid = Number(userId || 0);
  const identity = String(joinIdentity || '').trim();
  try {
    if (uid > 0) {
      const [rows] = await pool.execute(
        `SELECT 1 FROM provider_schedule_event_video_admissions
         WHERE event_id = ? AND (user_id = ? OR join_identity = ?)
         LIMIT 1`,
        [eid, uid, `user-${uid}`]
      );
      if (rows?.length) return true;
    }
    if (identity) {
      const [rows] = await pool.execute(
        `SELECT 1 FROM provider_schedule_event_video_admissions
         WHERE event_id = ? AND join_identity = ?
         LIMIT 1`,
        [eid, identity]
      );
      if (rows?.length) return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function admitJoinIdentity({ eventId, userId = null, joinIdentity = null }) {
  const eid = Number(eventId || 0);
  const uid = Number(userId || 0) || null;
  const identity = String(joinIdentity || (uid ? `user-${uid}` : '')).trim();
  if (!eid || !identity) return false;
  try {
    await pool.execute(
      `INSERT INTO provider_schedule_event_video_admissions (event_id, user_id, join_identity)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE admitted_at = admitted_at`,
      [eid, uid, identity]
    );
    return true;
  } catch (e) {
    console.warn('[teamMeeting] admit failed', e?.message || e);
    return false;
  }
}

function normalizeJoinIdentity(raw, { userId = null } = {}) {
  const identity = String(raw || '').trim();
  const uid = Number(userId || 0);
  if (uid > 0) return `user-${uid}`;
  if (/^\d+$/.test(identity)) return `user-${identity}`;
  const m = identity.match(/^user-(\d+)$/i);
  if (m) return `user-${m[1]}`;
  return identity;
}

function userIdFromJoinIdentity(raw) {
  const identity = normalizeJoinIdentity(raw);
  const m = String(identity || '').match(/^user-(\d+)$/);
  return m ? Number(m[1]) : null;
}

async function listWaitingLobbyPresence(eventId, {
  excludeUserIds = [],
  excludeDisplayNames = []
} = {}) {
  const eid = Number(eventId || 0);
  if (!eid) return [];
  await pruneStaleJoinPresence(eid);
  const excludeSet = new Set(
    (Array.isArray(excludeUserIds) ? excludeUserIds : [excludeUserIds])
      .map((n) => Number(n || 0))
      .filter((n) => Number.isFinite(n) && n > 0)
  );
  const excludeNames = new Set(
    (Array.isArray(excludeDisplayNames) ? excludeDisplayNames : [excludeDisplayNames])
      .map((s) => String(s || '').trim().toLowerCase())
      .filter(Boolean)
  );
  try {
    const [rows] = await pool.execute(
      `SELECT p.join_identity, p.display_name, p.is_guest, p.joined_at, p.last_seen_at
       FROM provider_schedule_event_join_presence p
       WHERE p.event_id = ?
         AND p.left_at IS NULL
         AND p.last_seen_at >= (UTC_TIMESTAMP() - INTERVAL ${JOIN_PRESENCE_STALE_SECONDS} SECOND)
         AND NOT EXISTS (
           SELECT 1 FROM provider_schedule_event_video_admissions a
           WHERE a.event_id = p.event_id
             AND (
               a.join_identity = p.join_identity
               OR (a.user_id IS NOT NULL AND CONCAT('user-', a.user_id) = p.join_identity)
               OR (a.user_id IS NOT NULL AND CAST(a.user_id AS CHAR) = p.join_identity)
             )
         )
       ORDER BY p.joined_at ASC`,
      [eid]
    );
    return (rows || []).map((r) => {
      const identity = normalizeJoinIdentity(r.join_identity);
      const userId = userIdFromJoinIdentity(identity);
      return {
        identity,
        joinIdentity: identity,
        userId,
        displayName: r.display_name || identity,
        isGuest: !!r.is_guest,
        sid: identity
      };
    }).filter((p) => {
      // Host (and the viewer fetching the list) are in the main room — never show as waiting.
      if (p.userId && excludeSet.has(Number(p.userId))) return false;
      for (const uid of excludeSet) {
        if (p.joinIdentity === `user-${uid}` || p.joinIdentity === String(uid)) return false;
      }
      const dn = String(p.displayName || '').trim().toLowerCase();
      if (dn && excludeNames.has(dn)) return false;
      return true;
    });
  } catch {
    return [];
  }
}

/**
 * Public: resolve event to org slug for join redirect.
 */
export const getTeamMeetingJoinInfo = async (req, res, next) => {
  try {
    const ref = String(req.params.eventId || '').trim();
    if (!ref) return res.status(400).json({ error: { message: 'Invalid event id' } });

    const event = await ProviderScheduleEvent.resolveByJoinRef(ref);
    if (!event?.id) return res.status(404).json({ error: { message: 'Event not found' } });
    const kindNorm = String(event.kind || '').toUpperCase();
    if (!['TEAM_MEETING', 'HUDDLE'].includes(kindNorm)) {
      return res.status(404).json({ error: { message: 'Event not found' } });
    }
    if (String(event.status || 'ACTIVE').toUpperCase() === 'CANCELLED') {
      return res.status(404).json({ error: { message: 'Event not found' } });
    }

    const [rows] = await pool.execute(
      `SELECT a.slug, a.portal_url
       FROM agencies a
       WHERE a.id = ? AND a.is_active = TRUE
       LIMIT 1`,
      [Number(event.agency_id || 0)]
    );
    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: { message: 'Event not found' } });

    const orgSlug = String(row.slug || row.portal_url || '').trim();
    if (!orgSlug) return res.status(404).json({ error: { message: 'Event organization has no portal' } });

    const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    const participantKey = String(event.participant_join_token || event.join_token || event.id);
    const hostKey = String(event.host_join_token || '').trim();
    const tokenRole = ProviderScheduleEvent.classifyJoinTokenRole(event, ref);
    // Preserve the token the user opened so host links are not rewritten to participant links.
    const redirectKey = tokenRole === 'host' && hostKey
      ? hostKey
      : (participantKey || String(event.id));
    res.json({
      orgSlug,
      eventId: Number(event.id),
      joinToken: redirectKey || null,
      hostJoinToken: hostKey || null,
      participantJoinToken: participantKey || null,
      joinPath: `/join/team-meeting/${encodeURIComponent(redirectKey)}`,
      hostJoinPath: hostKey ? `/join/team-meeting/${encodeURIComponent(hostKey)}` : null,
      joinUrl: joinUrlForTeamMeeting(frontendUrl, participantKey),
      hostJoinUrl: hostKey ? joinUrlForTeamMeeting(frontendUrl, hostKey) : null,
      waitingRoomEnabled: isWaitingRoomEnabled(event),
      joinTokenRole: tokenRole
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Get video token for team meeting (with waiting room when enabled).
 */
export const getTeamMeetingVideoToken = async (req, res, next) => {
  try {
    if (!isVideoConfigured()) {
      return res.status(503).json({ error: { message: 'Video is not configured' } });
    }

    const ref = String(req.params.eventId || '').trim();
    if (!ref) return res.status(400).json({ error: { message: 'Invalid event id' } });

    const row = await ProviderScheduleEvent.resolveByJoinRef(ref);
    if (!row) return res.status(404).json({ error: { message: 'Event not found' } });
    const eventId = Number(row.id);

    const kindNorm = String(row.kind || '').toUpperCase();
    if (kindNorm !== 'TEAM_MEETING' && kindNorm !== 'HUDDLE') {
      return res.status(400).json({ error: { message: 'Event is not a team meeting or huddle' } });
    }

    const ok = await canAccessTeamMeeting(req, row);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const actorUserId = Number(req.user?.id || 0);
    if (!actorUserId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    if (row.meeting_completed_at) {
      return res.status(410).json({
        error: { message: 'This meeting has ended.' },
        meetingCompletedAt: row.meeting_completed_at
      });
    }

    const projectId = resolveVideoProjectId();
    const tokenRole = ProviderScheduleEvent.classifyJoinTokenRole(row, ref);
    const isHost = actorUserId === Number(row.provider_id);
    if (tokenRole === 'host' && !isHost) {
      return res.status(403).json({
        error: { message: 'This is the host join link. Only the meeting host can use it.' }
      });
    }

    const waitingRoomOn = isWaitingRoomEnabled(row);
    const identity = `user-${actorUserId}`;
    // Host always bypasses the waiting room; mark them admitted so they never appear in the lobby list.
    if (isHost) {
      await admitJoinIdentity({ eventId, userId: actorUserId, joinIdentity: identity });
      // Drop legacy/duplicate host waiting rows (e.g. raw numeric identity or name-only).
      try {
        const hostName = displayNameFromUser(await User.findById(actorUserId)) || '';
        await pool.execute(
          `UPDATE provider_schedule_event_join_presence
           SET left_at = UTC_TIMESTAMP()
           WHERE event_id = ?
             AND left_at IS NULL
             AND join_identity <> ?
             AND (
               join_identity = ?
               OR (? <> '' AND LOWER(TRIM(COALESCE(display_name, ''))) = LOWER(?))
             )`,
          [eventId, identity, String(actorUserId), hostName, hostName]
        );
      } catch (e) {
        console.warn('[teamMeeting] host lobby presence cleanup failed', e?.message || e);
      }
    }
    const admitted = isHost || await isUserAdmitted({ eventId, userId: actorUserId, joinIdentity: identity });
    const useLobby = !isHost && waitingRoomOn && !admitted;

    const actor = await User.findById(actorUserId);
    const displayName = displayNameFromUser(actor) || `User ${actorUserId}`;
    const roleLabel = isHost ? 'Host' : 'Participant';
    const profilePhotoUrl = await profilePhotoUrlForUserId(actorUserId);

    let roomName;
    let vonageSessionId = null;
    if (useLobby) {
      roomName = kindNorm === 'HUDDLE' ? `huddle-${eventId}-lobby` : `team-meeting-${eventId}-lobby`;
      const lobbyRoom = await createOrGetRoomByUniqueName(roomName);
      vonageSessionId = lobbyRoom?.sid || lobbyRoom?.roomSid || null;
    } else {
      roomName = row.twilio_room_unique_name || (kindNorm === 'HUDDLE' ? `huddle-${eventId}` : `team-meeting-${eventId}`);
      vonageSessionId = String(row.twilio_room_sid || '').trim() || null;
      if (!vonageSessionId) {
        const roomResult = await createOrGetRoomByUniqueName(roomName);
        vonageSessionId = roomResult?.sid || roomResult?.roomSid || null;
        if (vonageSessionId) {
          await ProviderScheduleEvent.setVideoRoom(eventId, {
            roomSid: vonageSessionId,
            uniqueName: roomName
          });
        }
      }
    }

    if (!vonageSessionId) {
      return res.status(500).json({ error: { message: 'Failed to create or get video room' } });
    }

    const token = await createAccessTokenAsync({
      roomSid: vonageSessionId,
      identity,
      metadata: {
        role: isHost ? 'host' : 'participant',
        roleLabel,
        eventId,
        displayName,
        profilePhotoUrl
      }
    });

    if (!token) {
      return res.status(500).json({ error: { message: 'Failed to generate access token' } });
    }

    await upsertJoinPresence({
      eventId,
      joinIdentity: identity,
      displayName,
      isGuest: false
    });

    // Start / refresh payable attendance as soon as they receive a main-room token
    // (lobby heartbeats alone were leaving attendees at 0m until a later rebuild).
    if (!useLobby) {
      try {
        const {
          openAttendanceSegment,
          rebuildAttendanceRollupsFromSegments
        } = await import('../services/meetingAttendanceSegments.service.js');
        const opened = await openAttendanceSegment({
          eventId,
          userId: actorUserId,
          joinIdentity: identity,
          source: 'platform'
        });
        if (opened?.created || opened?.alreadyOpen) {
          await rebuildAttendanceRollupsFromSegments(eventId, { syncClaims: false });
        }
      } catch (e) {
        console.warn('[teamMeeting] open attendance on token failed', e?.message || e);
      }
    }

    res.json({
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
      isHost,
      eventId,
      joinToken: row.participant_join_token || row.join_token || null,
      hostJoinUrl: row.host_join_token
        ? joinUrlForTeamMeeting((process.env.FRONTEND_URL || '').replace(/\/$/, ''), row.host_join_token)
        : null,
      joinUrl: joinUrlForTeamMeeting(
        (process.env.FRONTEND_URL || '').replace(/\/$/, ''),
        row.participant_join_token || row.join_token || eventId
      ),
      roomMode: useLobby ? 'lobby' : 'main',
      lobbyEnabledForSession: waitingRoomOn,
      waitingRoomEnabled: waitingRoomOn,
      videoConfigured: true,
      diagnostics: getVideoClientDiagnostics({ token, sessionId: vonageSessionId })
    });
  } catch (e) {
    next(e);
  }
};

export const postTeamMeetingJoinPresence = async (req, res, next) => {
  try {
    const ref = String(req.params.eventId || '').trim();
    const actorUserId = Number(req.user?.id || 0) || null;
    const identity = normalizeJoinIdentity(
      req.body?.identity || req.body?.joinIdentity,
      { userId: actorUserId }
    );
    const action = String(req.body?.action || 'heartbeat').toLowerCase();
    if (!ref || !identity) {
      return res.status(400).json({ error: { message: 'identity required' } });
    }
    const row = await ProviderScheduleEvent.resolveByJoinRef(ref);
    if (!row?.id) return res.status(404).json({ error: { message: 'Event not found' } });

    const {
      openAttendanceSegment,
      closeAttendanceSegment,
      rebuildAttendanceRollupsFromSegments
    } = await import('../services/meetingAttendanceSegments.service.js');

    if (action === 'leave') {
      await markJoinPresenceLeft({ eventId: row.id, joinIdentity: identity });
      await closeAttendanceSegment({ eventId: row.id, joinIdentity: identity });
      await rebuildAttendanceRollupsFromSegments(row.id, { syncClaims: true });
      return res.json({ ok: true });
    }
    await upsertJoinPresence({
      eventId: row.id,
      joinIdentity: identity,
      displayName: String(req.body?.displayName || '').trim() || null,
      isGuest: !!req.body?.isGuest || identity.startsWith('guest-')
    });

    const isHost = actorUserId > 0 && actorUserId === Number(row.provider_id || 0);
    const waitingRoomOn = isWaitingRoomEnabled(row);
    const admitted = isHost
      || !waitingRoomOn
      || await isUserAdmitted({ eventId: row.id, userId: actorUserId, joinIdentity: identity });

    // Only accrue attendance once they're in the main room (not waiting).
    let opened = null;
    if (admitted) {
      opened = await openAttendanceSegment({
        eventId: row.id,
        userId: actorUserId || userIdFromJoinIdentity(identity),
        joinIdentity: identity,
        source: 'platform'
      });
      if (opened?.created || opened?.alreadyOpen) {
        await rebuildAttendanceRollupsFromSegments(row.id, { syncClaims: false });
      }
    }
    res.json({ ok: true, attendance: opened || null, admitted: !!admitted });
  } catch (e) {
    next(e);
  }
};

export const getTeamMeetingLobbyParticipants = async (req, res, next) => {
  try {
    const ref = String(req.params.eventId || '').trim();
    const row = await ProviderScheduleEvent.resolveByJoinRef(ref);
    if (!row?.id) return res.status(404).json({ error: { message: 'Event not found' } });

    const ok = await canAccessTeamMeeting(req, row);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const actorUserId = Number(req.user?.id || 0);
    if (actorUserId !== Number(row.provider_id)) {
      return res.status(403).json({ error: { message: 'Only the host can view the waiting room' } });
    }

    const hostId = Number(row.provider_id || 0);
    let hostDisplayName = '';
    if (hostId) {
      try {
        const hostUser = await User.findById(hostId);
        hostDisplayName = displayNameFromUser(hostUser) || '';
      } catch { /* ignore */ }
    }
    let actorDisplayName = '';
    if (actorUserId && actorUserId !== hostId) {
      try {
        const actor = await User.findById(actorUserId);
        actorDisplayName = displayNameFromUser(actor) || '';
      } catch { /* ignore */ }
    } else {
      actorDisplayName = hostDisplayName;
    }
    const participants = await listWaitingLobbyPresence(row.id, {
      excludeUserIds: [hostId, actorUserId],
      excludeDisplayNames: [hostDisplayName, actorDisplayName].filter(Boolean)
    });
    for (const p of participants) {
      if (p.userId) {
        // eslint-disable-next-line no-await-in-loop
        const photo = await profilePhotoUrlForUserId(p.userId);
        if (photo) p.profilePhotoUrl = photo;
      }
    }
    res.json({ participants, waitingRoomEnabled: isWaitingRoomEnabled(row) });
  } catch (e) {
    next(e);
  }
};

export const admitTeamMeetingParticipant = async (req, res, next) => {
  try {
    const ref = String(req.params.eventId || '').trim();
    const userIdRaw = req.params.userId;
    const joinIdentityBody = String(req.body?.joinIdentity || '').trim();
    const userIdNum = /^\d+$/.test(String(userIdRaw || '')) ? parseInt(userIdRaw, 10) : 0;
    const joinIdentity = normalizeJoinIdentity(
      joinIdentityBody
        || (!userIdNum && String(userIdRaw || '').startsWith('guest-') ? String(userIdRaw) : '')
        || (userIdNum ? `user-${userIdNum}` : ''),
      { userId: userIdNum || null }
    );
    if (!ref || (!userIdNum && !joinIdentity)) {
      return res.status(400).json({ error: { message: 'Invalid event or participant id' } });
    }

    const row = await ProviderScheduleEvent.resolveByJoinRef(ref)
      || (/^\d+$/.test(ref) ? await ProviderScheduleEvent.findById(Number(ref)) : null);
    if (!row?.id) return res.status(404).json({ error: { message: 'Event not found' } });
    const eventId = Number(row.id);

    const actorUserId = Number(req.user?.id || 0);
    if (actorUserId !== Number(row.provider_id)) {
      return res.status(403).json({ error: { message: 'Only the host can admit participants' } });
    }

    const admitted = await admitJoinIdentity({
      eventId,
      userId: userIdNum || null,
      joinIdentity
    });
    if (!admitted) {
      return res.status(500).json({ error: { message: 'Failed to admit participant' } });
    }
    try {
      const {
        openAttendanceSegment,
        rebuildAttendanceRollupsFromSegments
      } = await import('../services/meetingAttendanceSegments.service.js');
      await openAttendanceSegment({
        eventId,
        userId: userIdNum || null,
        joinIdentity,
        source: 'platform'
      });
      await rebuildAttendanceRollupsFromSegments(eventId, { syncClaims: false });
    } catch (e) {
      console.warn('[teamMeeting] attendance open on admit failed', e?.message || e);
    }
    res.json({ ok: true, admitted: userIdNum || joinIdentity, joinIdentity });
  } catch (e) {
    next(e);
  }
};

export const getTeamMeetingAdmissionStatus = async (req, res, next) => {
  try {
    const ref = String(req.params.eventId || '').trim();
    const row = await ProviderScheduleEvent.resolveByJoinRef(ref);
    if (!row?.id) return res.status(404).json({ error: { message: 'Event not found' } });

    const ok = await canAccessTeamMeeting(req, row);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const actorUserId = Number(req.user?.id || 0);
    const identity = `user-${actorUserId}`;
    const waitingRoomOn = isWaitingRoomEnabled(row);
    const isHost = actorUserId === Number(row.provider_id);
    const meetingCompletedAt = row.meeting_completed_at || null;

    if (meetingCompletedAt) {
      return res.json({
        admitted: false,
        roomMode: 'ended',
        meetingCompleted: true,
        meetingCompletedAt,
        lobbyEnabledForSession: waitingRoomOn,
        waitingRoomEnabled: waitingRoomOn
      });
    }

    if (isHost || !waitingRoomOn) {
      return res.json({
        admitted: true,
        roomMode: 'main',
        meetingCompleted: false,
        meetingCompletedAt: null,
        lobbyEnabledForSession: waitingRoomOn,
        waitingRoomEnabled: waitingRoomOn
      });
    }

    const admitted = await isUserAdmitted({
      eventId: row.id,
      userId: actorUserId,
      joinIdentity: identity
    });

    if (!admitted) {
      return res.json({
        admitted: false,
        roomMode: 'lobby',
        meetingCompleted: false,
        meetingCompletedAt: null,
        lobbyEnabledForSession: waitingRoomOn,
        waitingRoomEnabled: waitingRoomOn
      });
    }

    // Mint main-room credentials after admit.
    const projectId = resolveVideoProjectId();
    const kindNorm = String(row.kind || '').toUpperCase();
    const roomName = row.twilio_room_unique_name
      || (kindNorm === 'HUDDLE' ? `huddle-${row.id}` : `team-meeting-${row.id}`);
    let vonageSessionId = String(row.twilio_room_sid || '').trim() || null;
    if (!vonageSessionId) {
      const roomResult = await createOrGetRoomByUniqueName(roomName);
      vonageSessionId = roomResult?.sid || roomResult?.roomSid || null;
      if (vonageSessionId) {
        await ProviderScheduleEvent.setVideoRoom(row.id, {
          roomSid: vonageSessionId,
          uniqueName: roomName
        });
      }
    }
    if (!vonageSessionId) {
      return res.status(500).json({ error: { message: 'Failed to create or get video room' } });
    }

    const actor = await User.findById(actorUserId);
    const displayName = displayNameFromUser(actor) || `User ${actorUserId}`;
    const profilePhotoUrl = await profilePhotoUrlForUserId(actorUserId);
    const token = await createAccessTokenAsync({
      roomSid: vonageSessionId,
      identity,
      metadata: {
        role: 'participant',
        roleLabel: 'Participant',
        eventId: row.id,
        displayName,
        profilePhotoUrl
      }
    });
    if (!token) {
      return res.status(500).json({ error: { message: 'Failed to generate access token' } });
    }

    try {
      const {
        openAttendanceSegment,
        rebuildAttendanceRollupsFromSegments
      } = await import('../services/meetingAttendanceSegments.service.js');
      const opened = await openAttendanceSegment({
        eventId: row.id,
        userId: actorUserId,
        joinIdentity: identity,
        source: 'platform'
      });
      if (opened?.created || opened?.alreadyOpen) {
        await rebuildAttendanceRollupsFromSegments(row.id, { syncClaims: false });
      }
    } catch (e) {
      console.warn('[teamMeeting] open attendance on admit-status failed', e?.message || e);
    }

    res.json({
      admitted: true,
      roomMode: 'main',
      meetingCompleted: false,
      meetingCompletedAt: null,
      token: String(token).trim(),
      sessionId: vonageSessionId,
      applicationId: projectId,
      apiKey: projectId,
      roomName,
      roomSid: vonageSessionId,
      identity,
      displayName,
      roleLabel: 'Participant',
      profilePhotoUrl,
      isHost: false,
      eventId: Number(row.id),
      lobbyEnabledForSession: waitingRoomOn,
      waitingRoomEnabled: waitingRoomOn,
      diagnostics: getVideoClientDiagnostics({ token, sessionId: vonageSessionId })
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Set recording rules: host-only (host's screen + audio) or record all.
 */
export const setTeamMeetingRecordingRules = async (req, res, next) => {
  try {
    if (!isVideoConfigured()) {
      return res.status(503).json({ error: { message: 'Video is not configured' } });
    }

    const eventId = parseInt(req.params.eventId, 10);
    if (!eventId) return res.status(400).json({ error: { message: 'Invalid event id' } });

    const row = await ProviderScheduleEvent.findById(eventId);
    if (!row) return res.status(404).json({ error: { message: 'Event not found' } });

    const kindNorm = String(row.kind || '').toUpperCase();
    if (kindNorm !== 'TEAM_MEETING' && kindNorm !== 'HUDDLE') {
      return res.status(400).json({ error: { message: 'Event is not a team meeting or huddle' } });
    }

    const ok = await canAccessTeamMeeting(req, row);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const actorUserId = Number(req.user?.id || 0);
    if (!actorUserId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const isHost = actorUserId === Number(row.provider_id);
    if (!isHost) {
      return res.status(403).json({ error: { message: 'Only the host can change recording settings' } });
    }

    const recordHostOnly = req.body?.recordHostOnly === true;
    const roomSidOrName = row.twilio_room_sid || row.twilio_room_unique_name || (kindNorm === 'HUDDLE' ? `huddle-${eventId}` : `team-meeting-${eventId}`);

    const success = recordHostOnly
      ? await setHostOnlyRecordingRules(roomSidOrName, `user-${actorUserId}`)
      : await setRecordAllRecordingRules(roomSidOrName);

    if (!success) {
      return res.status(500).json({ error: { message: 'Failed to update recording rules' } });
    }

    res.json({ ok: true, recordHostOnly });
  } catch (e) {
    next(e);
  }
};

/**
 * Save client transcript from real-time transcription.
 * Default appends labeled chunks (live speech). Pass replace:true to overwrite (manual edit).
 */
export const saveTeamMeetingClientTranscript = async (req, res, next) => {
  try {
    const eventId = parseInt(req.params.eventId, 10);
    if (!eventId) return res.status(400).json({ error: { message: 'Invalid event id' } });

    const row = await ProviderScheduleEvent.findById(eventId);
    if (!row) return res.status(404).json({ error: { message: 'Event not found' } });

    const kindNorm = String(row.kind || '').toUpperCase();
    if (kindNorm !== 'TEAM_MEETING' && kindNorm !== 'HUDDLE') {
      return res.status(400).json({ error: { message: 'Event is not a team meeting or huddle' } });
    }

    const ok = await canAccessTeamMeeting(req, row);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const transcript = String(req.body?.transcript || '').trim();
    if (!transcript) return res.status(400).json({ error: { message: 'transcript is required' } });

    const replace = req.body?.replace === true;
    const label = String(req.body?.speakerLabel || req.body?.displayName || '').trim();
    const stamped = label ? `[${label}] ${transcript}` : transcript;

    await ProviderScheduleEventArtifact.ensureTagged({ eventId });
    let nextText = stamped;
    if (!replace) {
      const existing = await ProviderScheduleEventArtifact.findByEventId(eventId);
      const prev = String(existing?.transcript_text || '').trim();
      if (prev) {
        if (prev.includes(stamped)) nextText = prev;
        else nextText = `${prev}\n${stamped}`;
      }
    }

    await ProviderScheduleEventArtifact.upsertByEventId({
      eventId,
      transcriptText: nextText.slice(0, 120000),
      updatedByUserId: Number(req.user?.id || 0) || null
    });

    const { triggerTeamMeetingSummaryFromTranscript } = await import('../services/teamMeetingTranscriptSummary.service.js');
    await triggerTeamMeetingSummaryFromTranscript(eventId).catch((e) => {
      console.error('[TeamMeeting] AI summary from client transcript:', e?.message);
    });

    res.json({ ok: true, eventId, chars: nextText.length });
  } catch (e) {
    next(e);
  }
};

async function loadMeetingParticipants(event) {
  const eid = Number(event?.id || 0);
  if (!eid) return [];
  const hostId = Number(event.provider_id || 0);
  const [rows] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role
     FROM (
       SELECT ? AS user_id
       UNION
       SELECT psa.user_id FROM provider_schedule_event_attendees psa WHERE psa.event_id = ?
     ) x
     JOIN users u ON u.id = x.user_id
     ORDER BY u.last_name ASC, u.first_name ASC`,
    [hostId || 0, eid]
  );
  return (rows || []).map((r) => ({
    id: Number(r.id),
    firstName: r.first_name,
    lastName: r.last_name,
    name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email || `User ${r.id}`,
    email: r.email || null,
    role: r.role || null,
    isHost: Number(r.id) === hostId
  }));
}

function syncEscalationStatusFromActionItem(prevItem, nextItem) {
  const ticketId = Number(nextItem?.escalationTicketId || prevItem?.escalationTicketId || 0);
  if (!ticketId) return null;
  const wasDone = !!prevItem?.done;
  const isDone = !!nextItem?.done;
  if (!wasDone && isDone) return { ticketId, status: 'resolved' };
  if (wasDone && !isDone) return { ticketId, status: 'under_review' };
  return null;
}

/** GET /api/team-meetings/:eventId/workspace */
export const getTeamMeetingWorkspace = async (req, res, next) => {
  try {
    const eventId = parseInt(req.params.eventId, 10);
    if (!eventId) return res.status(400).json({ error: { message: 'Invalid event id' } });
    const event = await ProviderScheduleEvent.findById(eventId);
    const kind = String(event?.kind || '').toUpperCase();
    if (!event || !['TEAM_MEETING', 'HUDDLE'].includes(kind)) {
      return res.status(404).json({ error: { message: 'Meeting not found' } });
    }
    if (!(await canAccessTeamMeeting(req, event))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const artifact = await ProviderScheduleEventArtifact.findByEventId(eventId);
    const workspace = ProviderScheduleEventArtifact.toWorkspaceDto(artifact);
    const participants = await loadMeetingParticipants(event);
    const subtypeRaw = String(event.meeting_subtype || 'general').toLowerCase();
    const meetingSubtype = (subtypeRaw === 'admin' || subtypeRaw === 'town_hall') ? subtypeRaw : 'general';
    res.json({
      ok: true,
      eventId,
      meetingSubtype,
      kind,
      title: String(event.title || '').trim() || null,
      participants,
      workspace
    });
  } catch (e) {
    next(e);
  }
};

/** POST /api/team-meetings/:eventId/workspace */
export const upsertTeamMeetingWorkspace = async (req, res, next) => {
  try {
    const eventId = parseInt(req.params.eventId, 10);
    if (!eventId) return res.status(400).json({ error: { message: 'Invalid event id' } });
    const event = await ProviderScheduleEvent.findById(eventId);
    const kind = String(event?.kind || '').toUpperCase();
    if (!event || !['TEAM_MEETING', 'HUDDLE'].includes(kind)) {
      return res.status(404).json({ error: { message: 'Meeting not found' } });
    }
    if (!(await canAccessTeamMeeting(req, event))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const prev = ProviderScheduleEventArtifact.toWorkspaceDto(
      await ProviderScheduleEventArtifact.findByEventId(eventId)
    );
    const body = req.body || {};
    const workspace = await ProviderScheduleEventArtifact.upsertWorkspace({
      eventId,
      focusTitle: body.focusTitle !== undefined ? body.focusTitle : body.focus_title,
      goals: body.goals !== undefined ? body.goals : body.goalsJson,
      actionItems: body.actionItems !== undefined ? body.actionItems : body.actionItemsJson,
      updatedByUserId: req.user?.id
    });

    // Bidirectional: completing/dismissing an escalated action item updates the desk ticket.
    try {
      const prevById = new Map((prev.actionItems || []).map((a) => [String(a.id), a]));
      for (const item of workspace.actionItems || []) {
        const sync = syncEscalationStatusFromActionItem(prevById.get(String(item.id)), item);
        if (!sync) continue;
        // eslint-disable-next-line no-await-in-loop
        await pool.execute(
          `UPDATE support_tickets
           SET escalation_status = ?,
               status = CASE WHEN ? IN ('resolved', 'closed') THEN 'closed' ELSE 'open' END,
               answered_at = CASE WHEN ? IN ('resolved', 'closed') THEN COALESCE(answered_at, CURRENT_TIMESTAMP) ELSE answered_at END
           WHERE id = ? AND COALESCE(ticket_kind, 'support') = 'escalation'`,
          [sync.status, sync.status, sync.status, sync.ticketId]
        );
      }
    } catch (syncErr) {
      console.warn('[teamMeetings] escalation sync from workspace failed', syncErr?.message || syncErr);
    }

    const participants = await loadMeetingParticipants(event);
    res.json({
      ok: true,
      eventId,
      meetingSubtype: String(event.meeting_subtype || 'general').toLowerCase() === 'admin' ? 'admin' : 'general',
      participants,
      workspace
    });
  } catch (e) {
    next(e);
  }
};

/** POST /api/team-meetings/:eventId/action-items/:itemId/escalate */
export const escalateTeamMeetingActionItem = async (req, res, next) => {
  try {
    const { isEscalationSubmitterRole } = await import('../constants/orgEscalations.js');
    const role = String(req.user?.role || '').toLowerCase();
    if (!isEscalationSubmitterRole(role)) {
      return res.status(403).json({ error: { message: 'You cannot submit escalations' } });
    }

    const eventId = parseInt(req.params.eventId, 10);
    const itemId = String(req.params.itemId || '').trim();
    if (!eventId || !itemId) {
      return res.status(400).json({ error: { message: 'eventId and itemId are required' } });
    }
    const event = await ProviderScheduleEvent.findById(eventId);
    const kind = String(event?.kind || '').toUpperCase();
    if (!event || kind !== 'TEAM_MEETING') {
      return res.status(404).json({ error: { message: 'Team meeting not found' } });
    }
    if (String(event.meeting_subtype || '').toLowerCase() !== 'admin') {
      return res.status(400).json({ error: { message: 'Escalations can only be added on Admin Meetings.' } });
    }
    if (!(await canAccessTeamMeeting(req, event))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const agencyId = Number(event.agency_id || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'Meeting agency is required' } });

    const workspace = ProviderScheduleEventArtifact.toWorkspaceDto(
      await ProviderScheduleEventArtifact.findByEventId(eventId)
    );
    const item = (workspace.actionItems || []).find((a) => String(a.id) === itemId);
    if (!item) return res.status(404).json({ error: { message: 'Action item not found' } });
    if (item.escalationTicketId) {
      return res.status(409).json({
        error: { message: 'This action item is already linked to an escalation' },
        escalationTicketId: item.escalationTicketId
      });
    }

    const issue = String(req.body?.issue || req.body?.question || item.text || '').trim();
    const recommended = String(req.body?.recommendedResolution || req.body?.recommended_resolution || '').trim();
    if (!issue) return res.status(400).json({ error: { message: 'Issue is required' } });
    if (!recommended) return res.status(400).json({ error: { message: 'Recommended resolution is required' } });

    const rootCause = String(req.body?.rootCause || req.body?.root_cause || '').trim() || null;
    const immediate =
      req.body?.immediateActionRequired === true
      || req.body?.immediateActionRequired === 1
      || req.body?.immediate_action_required === true
      || req.body?.immediate_action_required === 1;
    const subject = String(req.body?.subject || '').trim().slice(0, 255) || issue.slice(0, 80);

    const [insertResult] = await pool.execute(
      `INSERT INTO support_tickets
        (school_organization_id, created_by_user_id, agency_id, subject, question, status, priority,
         ticket_kind, escalation_status, root_cause, recommended_resolution, immediate_action_required,
         linked_schedule_event_id, linked_recurrence_series_id, linked_action_item_id)
       VALUES (?, ?, ?, ?, ?, 'open', ?, 'escalation', 'submitted', ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        req.user.id,
        agencyId,
        subject,
        issue,
        immediate ? 'high' : 'medium',
        rootCause,
        recommended,
        immediate ? 1 : 0,
        eventId,
        String(event.recurrence_series_id || '').trim() || null,
        itemId
      ]
    );
    const ticketId = Number(insertResult?.insertId || 0);
    if (!ticketId) return res.status(500).json({ error: { message: 'Failed to create escalation' } });

    // Prefer the action-item assignee as ticket owner; otherwise use chain-of-responsibility routing.
    let claimedByUserId = Number(item.assigneeUserId || item.assignee_user_id || 0) || 0;
    if (!claimedByUserId) {
      try {
        const Agency = (await import('../models/Agency.model.js')).default;
        const agency = await Agency.findById(agencyId);
        const raw = agency?.escalation_routing_json;
        let routing = [];
        try {
          const parsed = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
          routing = Array.isArray(parsed) ? parsed : [];
        } catch {
          routing = [];
        }
        for (const step of routing) {
          const type = String(step?.type || '').toLowerCase();
          const value = step?.value;
          if (type === 'user') {
            const uid = parseInt(value, 10);
            if (!uid) continue;
            const [rows] = await pool.execute(
              `SELECT u.id FROM users u
               INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
               WHERE u.id = ? AND COALESCE(u.is_archived, 0) = 0
               LIMIT 1`,
              [agencyId, uid]
            );
            if (rows?.[0]?.id) {
              claimedByUserId = Number(rows[0].id);
              break;
            }
          } else if (type === 'role') {
            const r = String(value || '').toLowerCase();
            if (!r) continue;
            const [rows] = await pool.execute(
              `SELECT u.id FROM users u
               INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
               WHERE LOWER(u.role) = ?
                 AND COALESCE(u.is_archived, 0) = 0
               ORDER BY u.last_name ASC, u.first_name ASC
               LIMIT 1`,
              [agencyId, r]
            );
            if (rows?.[0]?.id) {
              claimedByUserId = Number(rows[0].id);
              break;
            }
          }
        }
      } catch {
        /* optional auto-assign */
      }
    }
    if (claimedByUserId > 0) {
      await pool.execute(
        `UPDATE support_tickets
         SET claimed_by_user_id = ?, claimed_at = CURRENT_TIMESTAMP, escalation_status = 'assigned'
         WHERE id = ?`,
        [claimedByUserId, ticketId]
      );
    }

    const nextActions = (workspace.actionItems || []).map((a) => (
      String(a.id) === itemId
        ? {
            ...a,
            isEscalation: true,
            escalationTicketId: ticketId,
            text: a.text || issue,
            assigneeUserId: claimedByUserId || a.assigneeUserId || null
          }
        : a
    ));
    const saved = await ProviderScheduleEventArtifact.upsertWorkspace({
      eventId,
      actionItems: nextActions,
      updatedByUserId: req.user.id
    });

    res.status(201).json({
      ok: true,
      escalationTicketId: ticketId,
      workspace: saved
    });
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(503).json({
        error: { message: 'Escalation meeting links are not available until migrations 1052–1054 are applied.' }
      });
    }
    next(e);
  }
};

async function canEditMeetingTimeClaims(req, agencyId) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin' || role === 'superadmin' || role === 'admin') return true;
  const uid = Number(req.user?.id || 0);
  const aid = Number(agencyId || 0);
  if (!uid || !aid) return false;
  try {
    const [rows] = await pool.execute(
      'SELECT has_payroll_access FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
      [uid, aid]
    );
    const v = rows?.[0]?.has_payroll_access;
    return v === 1 || v === true || v === '1';
  } catch {
    return false;
  }
}

function isCompensationEligibleMeeting(event) {
  const kind = String(event?.kind || '').toUpperCase();
  if (kind === 'HUDDLE') return true;
  if (kind !== 'TEAM_MEETING') return false;
  const subtype = String(event?.meeting_subtype || 'general').trim().toLowerCase();
  return subtype === 'admin' || subtype === 'town_hall';
}

/** POST /api/team-meetings/:eventId/complete — host marks session completed (stops pay accrual). */
export const completeTeamMeetingSession = async (req, res, next) => {
  try {
    const eventId = parseInt(req.params.eventId, 10);
    if (!eventId) return res.status(400).json({ error: { message: 'Invalid event id' } });
    const event = await ProviderScheduleEvent.findById(eventId);
    if (!event || !['TEAM_MEETING', 'HUDDLE'].includes(String(event.kind || '').toUpperCase())) {
      return res.status(404).json({ error: { message: 'Meeting not found' } });
    }
    const actorId = Number(req.user?.id || 0);
    const role = String(req.user?.role || '').toLowerCase();
    const isHost = actorId === Number(event.provider_id || 0);
    const isPrivileged = ['super_admin', 'superadmin', 'admin', 'support'].includes(role);
    if (!isHost && !isPrivileged) {
      return res.status(403).json({ error: { message: 'Only the host or admin/support/super admin can complete this meeting.' } });
    }
    const { completeMeetingSession } = await import('../services/meetingAttendanceSegments.service.js');
    const result = await completeMeetingSession({ eventId, actorUserId: actorId });
    if (!result?.ok) {
      return res.status(400).json({ error: { message: result?.error || 'Unable to complete meeting' } });
    }

    // Kick everyone still in the live Vonage room (signal + force-disconnect).
    const roomSid = String(event.twilio_room_sid || '').trim();
    let videoEnd = null;
    if (roomSid) {
      try {
        videoEnd = await completeRoom(roomSid);
      } catch (e) {
        console.warn('[teamMeeting] completeRoom failed', e?.message || e);
      }
    }

    res.json({ ...result, videoEnd });
  } catch (e) {
    next(e);
  }
};

/** GET /api/team-meetings/:eventId/attendance */
export const getTeamMeetingAttendance = async (req, res, next) => {
  try {
    const eventId = parseInt(req.params.eventId, 10);
    if (!eventId) return res.status(400).json({ error: { message: 'Invalid event id' } });
    const event = await ProviderScheduleEvent.findById(eventId);
    if (!event || !['TEAM_MEETING', 'HUDDLE'].includes(String(event.kind || '').toUpperCase())) {
      return res.status(404).json({ error: { message: 'Meeting not found' } });
    }
    if (!(await canAccessTeamMeeting(req, event))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    // Open segments for anyone currently present + admitted (fixes 0m while in-room).
    try {
      const {
        openAttendanceSegment,
        rebuildAttendanceRollupsFromSegments
      } = await import('../services/meetingAttendanceSegments.service.js');
      await pruneStaleJoinPresence(eventId);
      const [present] = await pool.execute(
        `SELECT p.join_identity
         FROM provider_schedule_event_join_presence p
         WHERE p.event_id = ?
           AND p.left_at IS NULL
           AND p.last_seen_at >= (UTC_TIMESTAMP() - INTERVAL ${JOIN_PRESENCE_STALE_SECONDS} SECOND)`,
        [eventId]
      );
      for (const row of present || []) {
        const identity = normalizeJoinIdentity(row.join_identity);
        const uid = userIdFromJoinIdentity(identity);
        if (!uid) continue;
        // Active presence heartbeat means they're in the live join flow — accrue time.
        // eslint-disable-next-line no-await-in-loop
        await openAttendanceSegment({
          eventId,
          userId: uid,
          joinIdentity: identity,
          source: 'platform',
          force: true
        });
      }
      await rebuildAttendanceRollupsFromSegments(eventId, { syncClaims: false });
    } catch (e) {
      console.warn('[teamMeeting] attendance sync on list failed', e?.message || e);
    }
    const { listAttendanceSummary } = await import('../services/meetingAttendanceSegments.service.js');
    const summary = await listAttendanceSummary(eventId);
    res.json(summary || { eventId, participants: [], copyNamesCsv: '', copyNamesWithTimeCsv: '' });
  } catch (e) {
    next(e);
  }
};

/** GET /api/team-meetings/:eventId/time-claims */
export const getTeamMeetingTimeClaims = async (req, res, next) => {
  try {
    const eventId = parseInt(req.params.eventId, 10);
    if (!eventId) return res.status(400).json({ error: { message: 'Invalid event id' } });
    const event = await ProviderScheduleEvent.findById(eventId);
    if (!event || !['TEAM_MEETING', 'HUDDLE'].includes(String(event.kind || '').toUpperCase())) {
      return res.status(404).json({ error: { message: 'Meeting not found' } });
    }
    if (!(await canAccessTeamMeeting(req, event))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!isCompensationEligibleMeeting(event)) {
      return res.json({
        eventId,
        eligible: false,
        canEdit: false,
        rows: []
      });
    }

    try {
      const { rebuildAttendanceRollupsFromSegments } = await import('../services/meetingAttendanceSegments.service.js');
      await rebuildAttendanceRollupsFromSegments(eventId, { syncClaims: true });
    } catch { /* ignore */ }

    const { listAttendanceSummary } = await import('../services/meetingAttendanceSegments.service.js');
    const attendance = await listAttendanceSummary(eventId);
    const [claimRows] = await pool.execute(
      `SELECT *
       FROM payroll_time_claims
       WHERE claim_type = 'meeting_training'
         AND CAST(JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.scheduleEventId')) AS UNSIGNED) = ?
         AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.source')) = 'meeting_compensation_auto'
       ORDER BY user_id ASC, id DESC`,
      [eventId]
    );
    const latestByUser = new Map();
    for (const c of claimRows || []) {
      const uid = Number(c.user_id || 0);
      if (!uid || latestByUser.has(uid)) continue;
      let payload = {};
      try {
        payload = typeof c.payload_json === 'string' ? JSON.parse(c.payload_json) : (c.payload_json || {});
      } catch { payload = {}; }
      latestByUser.set(uid, {
        claimId: Number(c.id),
        userId: uid,
        status: c.status,
        claimDate: c.claim_date,
        serviceCode: payload.serviceCode || null,
        meetingType: payload.meetingType || null,
        totalMinutes: Number(payload.totalMinutes || 0) || 0,
        appliedAmount: c.applied_amount != null ? Number(c.applied_amount) : null
      });
    }

    const kind = String(event.kind || '').toUpperCase();
    const hostId = Number(event.provider_id || 0);
    const rows = (attendance?.participants || []).map((p) => {
      const claim = latestByUser.get(Number(p.userId)) || null;
      const defaultCode = (kind === 'HUDDLE' && p.isHost) ? 'Individual Meeting' : 'MEETING';
      return {
        userId: p.userId,
        name: p.name,
        role: p.role,
        isHost: !!p.isHost,
        attendanceMinutes: p.totalMinutes,
        attendanceSeconds: p.totalSeconds,
        serviceCode: claim?.serviceCode || defaultCode,
        claimId: claim?.claimId || null,
        status: claim?.status || null,
        totalMinutes: claim?.totalMinutes ?? p.totalMinutes,
        appliedAmount: claim?.appliedAmount ?? null,
        claimDate: claim?.claimDate || null
      };
    });

    const canEdit = await canEditMeetingTimeClaims(req, event.agency_id);
    res.json({
      eventId,
      eligible: true,
      canEdit,
      meetingCompletedAt: attendance?.meetingCompletedAt || null,
      rows
    });
  } catch (e) {
    next(e);
  }
};

/** PATCH /api/team-meetings/:eventId/time-claims/:claimId */
export const patchTeamMeetingTimeClaim = async (req, res, next) => {
  try {
    const eventId = parseInt(req.params.eventId, 10);
    const claimId = parseInt(req.params.claimId, 10);
    if (!eventId || !claimId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    const event = await ProviderScheduleEvent.findById(eventId);
    if (!event || !isCompensationEligibleMeeting(event)) {
      return res.status(404).json({ error: { message: 'Eligible meeting not found' } });
    }
    if (!(await canEditMeetingTimeClaims(req, event.agency_id))) {
      return res.status(403).json({ error: { message: 'Only admin, super admin, or payroll can edit meeting time claims.' } });
    }

    const PayrollTimeClaim = (await import('../models/PayrollTimeClaim.model.js')).default;
    const claim = await PayrollTimeClaim.findById(claimId);
    if (!claim) return res.status(404).json({ error: { message: 'Time claim not found' } });
    const payload = claim.payload || {};
    if (Number(payload.scheduleEventId || 0) !== eventId) {
      return res.status(400).json({ error: { message: 'Claim does not belong to this meeting' } });
    }
    if (String(payload.source || '') !== 'meeting_compensation_auto') {
      return res.status(400).json({ error: { message: 'Only auto meeting compensation claims can be edited here' } });
    }
    const status = String(claim.status || '').toLowerCase();
    if (!['submitted', 'deferred', 'rejected', 'withdrawn'].includes(status)) {
      return res.status(400).json({ error: { message: 'Only unapproved claims can be edited' } });
    }

    const mins = Number(req.body?.totalMinutes ?? req.body?.total_minutes);
    if (!(Number.isFinite(mins) && mins >= 0.5)) {
      return res.status(400).json({ error: { message: 'totalMinutes must be at least 0.5' } });
    }
    const nextPayload = {
      ...payload,
      totalMinutes: Math.round(mins * 100) / 100,
      editedByUserId: Number(req.user?.id || 0) || null,
      editedAt: new Date().toISOString(),
      editNote: String(req.body?.note || req.body?.editNote || '').trim().slice(0, 500) || payload.editNote || null
    };
    const updated = await PayrollTimeClaim.resubmit({
      id: claimId,
      payload: nextPayload
    });
    res.json({ ok: true, claim: updated });
  } catch (e) {
    next(e);
  }
};

/** GET /api/team-meetings/:eventId/notes — transcript + summary */
export const getTeamMeetingNotes = async (req, res, next) => {
  try {
    const eventId = parseInt(req.params.eventId, 10);
    if (!eventId) return res.status(400).json({ error: { message: 'Invalid event id' } });
    const event = await ProviderScheduleEvent.findById(eventId);
    if (!event || !['TEAM_MEETING', 'HUDDLE'].includes(String(event.kind || '').toUpperCase())) {
      return res.status(404).json({ error: { message: 'Meeting not found' } });
    }
    if (!(await canAccessTeamMeeting(req, event))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const artifact = await ProviderScheduleEventArtifact.findByEventId(eventId);
    res.json({
      eventId,
      transcript: artifact?.transcript_text || '',
      summary: artifact?.summary_text || '',
      meetingSubtype: String(event.meeting_subtype || 'general').toLowerCase(),
      kind: String(event.kind || '').toUpperCase()
    });
  } catch (e) {
    next(e);
  }
};
