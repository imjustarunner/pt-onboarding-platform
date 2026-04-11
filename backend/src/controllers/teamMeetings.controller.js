/**
 * Team meeting (TEAM_MEETING provider_schedule_events) video token and transcript.
 * Mirrors supervision flow for staff/agency meetings.
 */

import pool from '../config/database.js';
import User from '../models/User.model.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import ProviderScheduleEventArtifact from '../models/ProviderScheduleEventArtifact.model.js';
import {
  isVideoConfigured,
  createOrGetRoomByUniqueName,
  createAccessTokenAsync,
  setHostOnlyRecordingRules,
  setRecordAllRecordingRules
} from '../services/video.service.js';

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

/**
 * Public: resolve event to org slug for join redirect.
 */
export const getTeamMeetingJoinInfo = async (req, res, next) => {
  try {
    const eventId = parseInt(req.params.eventId, 10);
    if (!eventId) return res.status(400).json({ error: { message: 'Invalid event id' } });

    const [rows] = await pool.execute(
      `SELECT a.slug, a.portal_url
       FROM provider_schedule_events pse
       JOIN agencies a ON a.id = pse.agency_id AND a.is_active = TRUE
       WHERE pse.id = ?
         AND UPPER(COALESCE(pse.kind, '')) IN ('TEAM_MEETING', 'HUDDLE')
         AND UPPER(COALESCE(pse.status, 'ACTIVE')) <> 'CANCELLED'
       LIMIT 1`,
      [eventId]
    );
    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: { message: 'Event not found' } });

    const orgSlug = String(row.slug || row.portal_url || '').trim();
    if (!orgSlug) return res.status(404).json({ error: { message: 'Event organization has no portal' } });

    res.json({ orgSlug, eventId });
  } catch (e) {
    next(e);
  }
};

/**
 * Get video token for team meeting.
 */
export const getTeamMeetingVideoToken = async (req, res, next) => {
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

    const roomName = row.twilio_room_unique_name || (kindNorm === 'HUDDLE' ? `huddle-${eventId}` : `team-meeting-${eventId}`);
    const roomResult = await createOrGetRoomByUniqueName(roomName);

    if (!roomResult) {
      return res.status(500).json({ error: { message: 'Failed to create or get video room' } });
    }

    if (!row.twilio_room_sid) {
      await ProviderScheduleEvent.setVideoRoom(eventId, {
        roomSid: roomResult.roomSid,
        uniqueName: roomResult.uniqueName
      });
    }

    const token = await createAccessTokenAsync({
      identity: `user-${actorUserId}`,
      roomName: roomResult.uniqueName
    });

    if (!token) {
      return res.status(500).json({ error: { message: 'Failed to generate access token' } });
    }

    const isHost = actorUserId === Number(row.provider_id);

    res.json({
      token,
      roomName: roomResult.uniqueName,
      roomSid: roomResult.roomSid,
      isHost
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Set recording rules: host-only (host's screen + audio) or record all.
 * Host only.
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
