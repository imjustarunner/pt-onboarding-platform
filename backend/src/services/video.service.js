import VonageVideoService from './vonageVideo.service.js';

/**
 * Video provider — CONFIGURED VIA VONAGE.
 */

export function isVideoConfigured() {
  return VonageVideoService.isVideoConfigured();
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
  return { sid: sessionId, uniqueName: uniqueName || sessionId };
}

export async function createOrGetRoomByUniqueName(uniqueName) {
  return await createOrGetRoom(uniqueName);
}

export async function completeRoom(roomSid) {
  // Vonage sessions don't need explicit completion, but we could stop archiving here.
  return { sid: roomSid, status: 'completed' };
}

/**
 * Generate a client access token for a session.
 */
export async function createAccessTokenAsync({ roomSid, identity, metadata = {} }) {
  if (!isVideoConfigured()) return null;
  const token = VonageVideoService.generateToken(roomSid, {
    data: JSON.stringify({ identity, ...metadata })
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
