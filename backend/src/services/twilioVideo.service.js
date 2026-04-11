/**
 * Video provider — NOT CONFIGURED.
 * Twilio Video has been removed. This stub keeps imports alive without crashing.
 * Wire up Vonage Video (or another provider) here when ready.
 */

export function isTwilioVideoConfigured() {
  return false;
}

// Room management — all return null (video not configured)
export async function createOrGetRoom()            { return null; }
export async function createOrGetRoomByUniqueName() { return null; }
export async function completeRoom()               { return null; }

// Token generation
export async function createAccessTokenAsync()     { return null; }

// Participants
export async function getRoomParticipants()        { return []; }
export async function listRoomParticipants()       { return []; }

// Recordings
export async function listRoomRecordings()         { return []; }

// Recording rules (host-only / record-all)
export async function setHostOnlyRecordingRules()  { return null; }
export async function setRecordAllRecordingRules() { return null; }
