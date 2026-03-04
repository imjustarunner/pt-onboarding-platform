/**
 * Twilio Programmable Video status callback webhook.
 * Receives participant-connected and participant-disconnected events
 * and records them as supervision/team-meeting attendance for accurate tracking.
 * On room-ended: fetches recordings, transcribes, saves to artifacts, triggers AI summary.
 */

import pool from '../config/database.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import SupervisionSessionArtifact from '../models/SupervisionSessionArtifact.model.js';
import ProviderScheduleEventArtifact from '../models/ProviderScheduleEventArtifact.model.js';
import AgencyMeetingAttendanceRollup from '../models/AgencyMeetingAttendanceRollup.model.js';
import { transcribeRoomRecordings } from '../services/twilioVideoRecording.service.js';
import { createDownloadAndStoreMeetingRecording } from '../services/twilioVideoComposition.service.js';

async function recomputeAttendanceRollupForUser({ sessionId, userId }) {
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

  for (const ev of events || []) {
    const evType = String(ev?.event_type || '').trim().toLowerCase();
    const atMs = ev?.event_at ? new Date(ev.event_at).getTime() : null;
    if (!Number.isFinite(atMs)) continue;
    if (evType === 'joined' || evType === 'opened') {
      openedStack.push(atMs);
      if (!firstJoinedAt || atMs < firstJoinedAt) firstJoinedAt = atMs;
      continue;
    }
    if ((evType === 'left' || evType === 'closed') && openedStack.length) {
      const openedAtMs = openedStack.pop();
      if (atMs > openedAtMs) {
        totalSeconds += Math.round((atMs - openedAtMs) / 1000);
        segmentCount += 1;
        if (!lastLeftAt || atMs > lastLeftAt) lastLeftAt = atMs;
      }
    }
  }

  for (const openedAtMs of openedStack) {
    if (nowMs > openedAtMs) {
      totalSeconds += Math.round((nowMs - openedAtMs) / 1000);
      segmentCount += 1;
    }
  }

  const pad2 = (n) => String(n).padStart(2, '0');
  const toMysql = (ms) => {
    if (!ms) return null;
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  };

  await SupervisionSession.upsertAttendanceRollup({
    sessionId: sid,
    userId: uid,
    firstJoinedAt: firstJoinedAt ? toMysql(firstJoinedAt) : null,
    lastLeftAt: lastLeftAt ? toMysql(lastLeftAt) : null,
    totalSeconds,
    segmentCount,
    isFinalized: openedStack.length === 0
  });
  return { sessionId: sid, userId: uid, totalSeconds };
}

/**
 * Process team-meeting room-ended: transcribe recordings, create composition, download/store video, save to artifacts.
 */
async function processTeamMeetingRoomEnded({ roomSid, roomName, eventId }) {
  const eid = Number(eventId || 0);
  if (!eid || !roomSid) return;
  try {
    const existing = await ProviderScheduleEventArtifact.findByEventId(eid);
    const hasTranscript = !!(existing?.transcript_text && String(existing.transcript_text).trim());
    if (hasTranscript) {
      const { triggerTeamMeetingSummaryFromTranscript } = await import('../services/teamMeetingTranscriptSummary.service.js');
      void triggerTeamMeetingSummaryFromTranscript(eid).catch((e) => {
        console.error('[TwilioVideo] Team meeting AI summary error:', e?.message);
      });
    }

    await new Promise((r) => setTimeout(r, 5000));

    const [transcriptResult, recordingResult] = await Promise.all([
      hasTranscript ? Promise.resolve(null) : transcribeRoomRecordings({
        roomSid,
        roomName,
        sessionId: eid,
        userId: 0
      }),
      createDownloadAndStoreMeetingRecording({ roomSid, eventId: eid })
    ]);

    const transcript = transcriptResult;
    if (transcript && String(transcript).trim()) {
      await ProviderScheduleEventArtifact.ensureTagged({ eventId: eid });
      await ProviderScheduleEventArtifact.upsertByEventId({
        eventId: eid,
        transcriptText: String(transcript).trim(),
        updatedByUserId: null
      });
      const { triggerTeamMeetingSummaryFromTranscript } = await import('../services/teamMeetingTranscriptSummary.service.js');
      void triggerTeamMeetingSummaryFromTranscript(eid).catch((e) => {
        console.error('[TwilioVideo] Team meeting AI summary error:', e?.message);
      });
    }

    if (recordingResult?.recordingPath || recordingResult?.recordingUrl) {
      await ProviderScheduleEventArtifact.ensureTagged({ eventId: eid });
      await ProviderScheduleEventArtifact.upsertByEventId({
        eventId: eid,
        recordingPath: recordingResult.recordingPath,
        recordingUrl: recordingResult.recordingUrl,
        updatedByUserId: null
      });
    }
  } catch (e) {
    console.error('[TwilioVideo] processTeamMeetingRoomEnded error:', e?.message);
  }
}

/**
 * Recompute agency meeting attendance rollup from Twilio join/leave events.
 */
async function recomputeTeamMeetingAttendanceForUser({ eventId, userId }) {
  const eid = Number(eventId || 0);
  const uid = Number(userId || 0);
  if (!eid || !uid) return null;

  const [events] = await pool.execute(
    `SELECT event_type, event_at FROM agency_meeting_twilio_attendance_events
     WHERE event_id = ? AND user_id = ?
     ORDER BY event_at ASC`,
    [eid, uid]
  );
  const openedStack = [];
  let totalSeconds = 0;
  const nowMs = Date.now();

  for (const ev of events || []) {
    const evType = String(ev?.event_type || '').trim().toLowerCase();
    const atMs = ev?.event_at ? new Date(ev.event_at).getTime() : null;
    if (!Number.isFinite(atMs)) continue;
    if (evType === 'joined') {
      openedStack.push(atMs);
      continue;
    }
    if (evType === 'left' && openedStack.length) {
      const openedAtMs = openedStack.pop();
      if (atMs > openedAtMs) {
        totalSeconds += Math.round((atMs - openedAtMs) / 1000);
      }
    }
  }

  for (const openedAtMs of openedStack) {
    if (nowMs > openedAtMs) {
      totalSeconds += Math.round((nowMs - openedAtMs) / 1000);
    }
  }

  if (totalSeconds > 0) {
    await AgencyMeetingAttendanceRollup.upsert({
      eventId: eid,
      userId: uid,
      totalSeconds,
      participantEmail: null
    });
  }
  return { eventId: eid, userId: uid, totalSeconds };
}

/**
 * Process room-ended: transcribe recordings and save to artifacts.
 * Runs asynchronously (fire-and-forget) so webhook responds quickly.
 * If client already posted a transcript (Twilio real-time transcription), skip recording pipeline.
 */
async function processRoomEnded({ roomSid, roomName, sessionId }) {
  const sid = Number(sessionId || 0);
  if (!sid || !roomSid) return;
  try {
    const existing = await SupervisionSessionArtifact.findBySessionId(sid);
    if (existing?.transcript_text && String(existing.transcript_text).trim()) {
      // Client already sent transcript; only ensure AI summary exists
      const { triggerSupervisionSummaryFromTranscript } = await import('../services/supervisionTranscriptSummary.service.js');
      await triggerSupervisionSummaryFromTranscript(sid).catch((e) => {
        console.error('[TwilioVideo] AI summary error:', e?.message);
      });
      return;
    }
    // Delay to allow Twilio to finish processing recordings
    await new Promise((r) => setTimeout(r, 5000));
    const transcript = await transcribeRoomRecordings({
      roomSid,
      roomName,
      sessionId: sid,
      userId: 0
    });
    if (transcript && String(transcript).trim()) {
      await SupervisionSessionArtifact.ensureTagged({ sessionId: sid });
      await SupervisionSessionArtifact.upsertBySessionId({
        sessionId: sid,
        transcriptText: String(transcript).trim(),
        updatedByUserId: null
      });
      const { triggerSupervisionSummaryFromTranscript } = await import('../services/supervisionTranscriptSummary.service.js');
      await triggerSupervisionSummaryFromTranscript(sid).catch((e) => {
        console.error('[TwilioVideo] AI summary error:', e?.message);
      });
    }
  } catch (e) {
    console.error('[TwilioVideo] processRoomEnded error:', e?.message);
  }
}

/**
 * Handle Twilio Video composition status callbacks.
 * POST /api/twilio/video/composition-status
 * Twilio POSTs when composition processing completes (status=completed) or fails.
 */
export const videoCompositionStatusWebhook = async (req, res) => {
  try {
    const compositionSid = String(req.body?.CompositionSid || '').trim();
    const status = String(req.body?.CompositionStatus || '').trim().toLowerCase();

    if (!compositionSid) return res.status(200).send('OK');

    if (status === 'completed') {
      const { processCompositionCompleted } = await import('../services/twilioVideoComposition.service.js');
      void processCompositionCompleted(compositionSid).catch((e) => {
        console.error('[TwilioVideo] composition completed handler error:', e?.message);
      });
    } else if (status === 'failed' || status === 'deleted') {
      try {
        await pool.execute(`DELETE FROM twilio_composition_pending WHERE composition_sid = ?`, [compositionSid]);
      } catch {
        // ignore
      }
    }

    return res.status(200).send('OK');
  } catch (e) {
    console.error('[TwilioVideo] composition webhook error:', e?.message);
    return res.status(200).send('OK');
  }
};

/**
 * Handle Twilio Video room status callbacks.
 * POST /api/twilio/video/webhook
 */
export const videoRoomStatusWebhook = async (req, res) => {
  try {
    const event = String(req.body?.StatusCallbackEvent || '').trim();
    const roomName = String(req.body?.RoomName || '').trim();
    const roomSid = String(req.body?.RoomSid || '').trim();
    const participantIdentity = String(req.body?.ParticipantIdentity || '').trim();
    const participantSid = String(req.body?.ParticipantSid || '').trim();
    const timestamp = String(req.body?.Timestamp || '').trim();

    if (event === 'room-ended') {
      const sessionIdMatch = roomName.match(/^supervision-(\d+)$/);
      const eventIdMatch = roomName.match(/^team-meeting-(\d+)$/);
      const huddleMatch = roomName.match(/^huddle-(\d+)$/);
      if (sessionIdMatch && roomSid) {
        const sessionId = parseInt(sessionIdMatch[1], 10);
        void processRoomEnded({ roomSid, roomName, sessionId });
      }
      if (eventIdMatch && roomSid) {
        const eventId = parseInt(eventIdMatch[1], 10);
        void processTeamMeetingRoomEnded({ roomSid, roomName, eventId });
      }
      if (huddleMatch && roomSid) {
        const eventId = parseInt(huddleMatch[1], 10);
        void processTeamMeetingRoomEnded({ roomSid, roomName, eventId });
      }
      return res.status(200).send('OK');
    }

    if (!['participant-connected', 'participant-disconnected'].includes(event)) {
      return res.status(200).send('OK');
    }

    const userIdMatch = participantIdentity.match(/^user-(\d+)$/);
    if (!userIdMatch) return res.status(200).send('OK');

    const userId = parseInt(userIdMatch[1], 10);
    if (!userId) return res.status(200).send('OK');

    const pad2 = (n) => String(n).padStart(2, '0');
    let eventAt = null;
    if (timestamp) {
      const d = new Date(timestamp);
      if (!Number.isNaN(d.getTime())) {
        eventAt = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
      }
    }
    if (!eventAt) {
      const now = new Date();
      eventAt = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
    }

    const eventType = event === 'participant-connected' ? 'joined' : 'left';

    // Supervision session
    const sessionIdMatch = roomName.match(/^supervision-(\d+)$/);
    if (sessionIdMatch) {
      const sessionId = parseInt(sessionIdMatch[1], 10);
      const [rows] = await pool.execute(
        `SELECT id, supervisor_user_id, supervisee_user_id FROM supervision_sessions WHERE id = ? LIMIT 1`,
        [sessionId]
      );
      const session = rows?.[0] || null;
      if (!session) return res.status(200).send('OK');

      const isParticipant =
        Number(session.supervisor_user_id) === userId || Number(session.supervisee_user_id) === userId;
      if (!isParticipant) return res.status(200).send('OK');

      let attendee = await SupervisionSession.findAttendeeBySessionUser(sessionId, userId);
      if (!attendee) {
        const role = Number(session.supervisor_user_id) === userId ? 'supervisor' : 'supervisee';
        await SupervisionSession.upsertAttendees(sessionId, [
          { userId, participantRole: role, isRequired: true, isCompensableSnapshot: false, status: 'INVITED' }
        ]);
        attendee = await SupervisionSession.findAttendeeBySessionUser(sessionId, userId);
      }

      await SupervisionSession.recordAttendanceEvent({
        sessionId,
        attendeeId: Number(attendee?.id || 0) || null,
        userId,
        participantSessionKey: participantSid || `twilio-${sessionId}-${userId}-${Date.now()}`,
        eventType,
        eventAt,
        rawPayload: {
          source: 'twilio_video_webhook',
          StatusCallbackEvent: event,
          RoomName: roomName,
          ParticipantSid: participantSid,
          ParticipantIdentity: participantIdentity
        }
      });

      await SupervisionSession.setAttendeeStatus({
        sessionId,
        userId,
        status: eventType === 'joined' ? 'JOINED' : 'LEFT'
      });

      await recomputeAttendanceRollupForUser({ sessionId, userId });
      return res.status(200).send('OK');
    }

    // Team meeting or Huddle
    const eventIdMatch = roomName.match(/^team-meeting-(\d+)$/);
    const huddleMatch = roomName.match(/^huddle-(\d+)$/);
    const meetingEventIdMatch = eventIdMatch || huddleMatch;
    if (meetingEventIdMatch) {
      const eventId = parseInt(meetingEventIdMatch[1], 10);
      const [rows] = await pool.execute(
        `SELECT id, provider_id FROM provider_schedule_events
         WHERE id = ? AND UPPER(COALESCE(kind, '')) IN ('TEAM_MEETING', 'HUDDLE')
           AND UPPER(COALESCE(status, 'ACTIVE')) <> 'CANCELLED'
         LIMIT 1`,
        [eventId]
      );
      const ev = rows?.[0] || null;
      if (!ev) return res.status(200).send('OK');

      const isProvider = Number(ev.provider_id) === userId;
      const [attendeeRows] = await pool.execute(
        `SELECT 1 FROM provider_schedule_event_attendees WHERE event_id = ? AND user_id = ? LIMIT 1`,
        [eventId, userId]
      );
      const isAttendee = attendeeRows?.length > 0;
      if (!isProvider && !isAttendee) return res.status(200).send('OK');

      await pool.execute(
        `INSERT INTO agency_meeting_twilio_attendance_events (event_id, user_id, event_type, event_at, participant_sid)
         VALUES (?, ?, ?, ?, ?)`,
        [eventId, userId, eventType, eventAt, participantSid || null]
      );

      await recomputeTeamMeetingAttendanceForUser({ eventId, userId });
      return res.status(200).send('OK');
    }

    return res.status(200).send('OK');
  } catch (e) {
    console.error('[TwilioVideo] webhook error:', e?.message);
    return res.status(200).send('OK');
  }
};
