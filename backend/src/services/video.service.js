import { dialInConfigured, dialInError } from './meetingDialInPolicy.js';
import pool from '../config/database.js';
import { roomUnavailable } from './meetingJoinPolicy.service.js';
import VonageVideoService, { resolveVideoProjectId } from './vonageVideo.service.js';

/**
 * Video provider — CONFIGURED VIA VONAGE.
 */

export function isVideoConfigured() {
  return VonageVideoService.isVideoConfigured();
}

export { resolveVideoProjectId };

/** Safe, non-secret diagnostics for clients troubleshooting video auth. */
export function getVideoClientDiagnostics({ token = null, sessionId = null } = {}) {
  const projectId = resolveVideoProjectId();
  const tokenStr = token == null ? '' : String(token);
  return {
    applicationIdPresent: !!String(process.env.VONAGE_APPLICATION_ID || '').trim(),
    applicationIdFormat: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      String(process.env.VONAGE_APPLICATION_ID || '').trim()
    )
      ? 'uuid'
      : process.env.VONAGE_APPLICATION_ID
        ? 'other'
        : 'missing',
    projectIdPresent: !!projectId,
    projectIdFormat: projectId
      ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)
        ? 'uuid'
        : /^[0-9]+$/.test(projectId)
          ? 'numeric'
          : 'other'
      : 'missing',
    sessionIdPresent: !!sessionId,
    sessionIdLength: sessionId ? String(sessionId).length : 0,
    tokenPresent: !!tokenStr,
    tokenFormat: tokenStr.startsWith('eyJ')
      ? 'jwt'
      : tokenStr.startsWith('T1==')
        ? 'opentok_legacy'
        : tokenStr
          ? 'unknown'
          : 'missing'
  };
}

/**
 * Create or get a room (session in Vonage terms).
 */
export async function createOrGetRoom(uniqueName = null) {
  if (!isVideoConfigured()) return null;
  // In Vonage, we create a session. Unique naming isn't built-in like Twilio,
  // so we'd typically store the uniqueName -> sessionId mapping in our DB.
  // For now, we'll just create a new session.
  const sessionId = await VonageVideoService.createSession();
  const unique = uniqueName || sessionId;
  // Expose both sid and roomSid — callers historically used either name.
  return { sid: sessionId, roomSid: sessionId, uniqueName: unique };
}

export async function createOrGetRoomByUniqueName(uniqueName) {
  return await createOrGetRoom(uniqueName);
}

export async function completeRoom(roomSid, details = null) {
  // Signal + force-disconnect everyone still in the Vonage session.
  try {
    const result = await VonageVideoService.endLiveSession(roomSid, {
      reason: 'meeting_completed',
      details
    });
    return { sid: roomSid, status: 'completed', ...result };
  } catch (e) {
    console.warn('[video.service] completeRoom failed', e?.message || e);
    return { sid: roomSid, status: 'completed', ok: false };
  }
}

/**
 * Generate a client access token for a session.
 */
export async function createAccessTokenAsync({ roomSid, identity, metadata = {}, expireTime = null }) {
  if (!isVideoConfigured()) return null;
  const token = VonageVideoService.generateToken(roomSid, {
    data: JSON.stringify({ identity, ...metadata }),
    ...(expireTime == null ? {} : { expireTime })
  });
  return token;
}

// Participants — Stubs for now (Vonage requires session monitoring webhooks for this)
export async function getRoomParticipants()        { return []; }
export async function listRoomParticipants()       { return []; }

// Recordings
export async function listRoomRecordings()         { return []; }

// Recording rules (stubs)
export async function setHostOnlyRecordingRules()  { return null; }
export async function setRecordAllRecordingRules() { return null; }

/** Serialize main-room creation so browsers and optional phone callers share a room.
 * Phone eligibility is checked by the phone entry points, never by video creation.
 */
export async function createOrGetMeetingRoom(type, meetingId, uniqueName) {
  if (!dialInConfigured()) return createOrGetRoomByUniqueName(uniqueName);
  const table = type === 'supervision' ? 'supervision_sessions' : type === 'team-meeting' ? 'provider_schedule_events' : null;
  if (!table || !Number.isSafeInteger(Number(meetingId)) || Number(meetingId) <= 0) throw dialInError('Meeting not found.',404);
  const db = await pool.getConnection(), lock = `meeting-media:${type}:${meetingId}`;
  try {
    const [[held]] = await db.execute('SELECT GET_LOCK(?,5) acquired',[lock]);
    if (!Number(held.acquired)) throw dialInError('Meeting room creation is busy. Retry joining.',503);
    const [[meeting]] = await db.execute(`SELECT * FROM ${table} WHERE id=?`,[meetingId]);
    if (!meeting || (type === 'team-meeting' && !['TEAM_MEETING', 'HUDDLE'].includes(meeting.kind)))
      throw dialInError('Meeting not found.',404);
    const unavailable = roomUnavailable(meeting,type);
    if (unavailable) throw dialInError(unavailable.error.message,unavailable.status);
    if (['ENDED','MANUAL_PENDING','MANUAL_RECORDING'].includes(String(meeting.status).toUpperCase()))
      throw dialInError('This meeting has ended or is no longer available.',410);
    if (meeting.twilio_room_sid) return {sid:meeting.twilio_room_sid,roomSid:meeting.twilio_room_sid,uniqueName:meeting.twilio_room_unique_name || uniqueName};
    const room = await createOrGetRoomByUniqueName(uniqueName);
    if (!room?.sid) throw dialInError('Meeting video is not configured.',503);
    const ended = type==='supervision' ? 'live_ended_at' : 'meeting_completed_at';
    const [saved] = await db.execute(`UPDATE ${table} SET twilio_room_sid=?,twilio_room_unique_name=? WHERE id=? AND ${ended} IS NULL
      AND UPPER(COALESCE(status,'')) NOT IN ('CANCELLED','RESCHEDULED','MISSED','FINALIZED','COMPLETED','ENDED','MANUAL_PENDING','MANUAL_RECORDING')`,[room.sid,uniqueName,meetingId]);
    if (!saved.affectedRows) {
      await VonageVideoService.endLiveSession(room.sid,{reason:'meeting_closed'}).catch(()=>{});
      throw dialInError('This meeting ended while its room was being created.',410);
    }
    return room;
  } finally { await db.execute('SELECT RELEASE_LOCK(?)',[lock]).catch(()=>{}); db.release(); }
}
