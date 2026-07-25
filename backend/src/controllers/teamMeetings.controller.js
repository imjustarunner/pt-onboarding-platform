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

async function listWaitingLobbyPresence(eventId) {
  const eid = Number(eventId || 0);
  if (!eid) return [];
  await pruneStaleJoinPresence(eid);
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
             )
         )
       ORDER BY p.joined_at ASC`,
      [eid]
    );
    return (rows || []).map((r) => {
      const identity = String(r.join_identity || '');
      const m = identity.match(/^user-(\d+)$/);
      return {
        identity,
        joinIdentity: identity,
        userId: m ? Number(m[1]) : null,
        displayName: r.display_name || identity,
        isGuest: !!r.is_guest,
        sid: identity
      };
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
    const admitted = await isUserAdmitted({ eventId, userId: actorUserId, joinIdentity: identity });
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
    const identity = String(req.body?.identity || req.body?.joinIdentity || '').trim();
    const action = String(req.body?.action || 'heartbeat').toLowerCase();
    if (!ref || !identity) {
      return res.status(400).json({ error: { message: 'identity required' } });
    }
    const row = await ProviderScheduleEvent.resolveByJoinRef(ref);
    if (!row?.id) return res.status(404).json({ error: { message: 'Event not found' } });
    if (action === 'leave') {
      await markJoinPresenceLeft({ eventId: row.id, joinIdentity: identity });
      return res.json({ ok: true });
    }
    await upsertJoinPresence({
      eventId: row.id,
      joinIdentity: identity,
      displayName: String(req.body?.displayName || '').trim() || null,
      isGuest: !!req.body?.isGuest || identity.startsWith('guest-')
    });
    res.json({ ok: true });
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

    const participants = await listWaitingLobbyPresence(row.id);
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
    const eventId = parseInt(req.params.eventId, 10);
    const userIdRaw = req.params.userId;
    const joinIdentityBody = String(req.body?.joinIdentity || '').trim();
    const userIdNum = /^\d+$/.test(String(userIdRaw || '')) ? parseInt(userIdRaw, 10) : 0;
    const joinIdentity = joinIdentityBody
      || (!userIdNum && String(userIdRaw || '').startsWith('guest-') ? String(userIdRaw) : '')
      || (userIdNum ? `user-${userIdNum}` : '');
    if (!eventId || (!userIdNum && !joinIdentity)) {
      return res.status(400).json({ error: { message: 'Invalid event or participant id' } });
    }

    const row = await ProviderScheduleEvent.findById(eventId);
    if (!row) return res.status(404).json({ error: { message: 'Event not found' } });

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

    if (isHost || !waitingRoomOn) {
      return res.json({
        admitted: true,
        roomMode: 'main',
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

    res.json({
      admitted: true,
      roomMode: 'main',
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

    await ProviderScheduleEventArtifact.ensureTagged({ eventId });
    await ProviderScheduleEventArtifact.upsertByEventId({
      eventId,
      transcriptText: transcript.slice(0, 120000),
      updatedByUserId: Number(req.user?.id || 0) || null
    });

    const { triggerTeamMeetingSummaryFromTranscript } = await import('../services/teamMeetingTranscriptSummary.service.js');
    await triggerTeamMeetingSummaryFromTranscript(eventId).catch((e) => {
      console.error('[TeamMeeting] AI summary from client transcript:', e?.message);
    });

    res.json({ ok: true, eventId });
  } catch (e) {
    next(e);
  }
};
