/**
 * Twilio Programmable Video service for supervision sessions.
 * Provides room creation and access token generation for in-app video meetings
 * with accurate participant join/leave tracking for attendance.
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN (existing)
 *   TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET (create at twilio.com/console/runtime/api-keys, US1 region)
 *   TWILIO_VIDEO_WEBHOOK_URL (e.g. https://your-app.com/api/twilio/video/webhook)
 */

import crypto from 'crypto';
import twilio from 'twilio';
import TwilioService from './twilio.service.js';

const AccessToken = twilio.jwt.AccessToken;
const VideoGrant = AccessToken.VideoGrant;

function getVideoConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const webhookUrl = process.env.TWILIO_VIDEO_WEBHOOK_URL || '';
  if (!accountSid || !authToken || !apiKeySid || !apiKeySecret) {
    return null;
  }
  return { accountSid, authToken, apiKeySid, apiKeySecret, webhookUrl };
}

export function isTwilioVideoConfigured() {
  return getVideoConfig() !== null;
}

/**
 * Create or get a Twilio Video room by unique name.
 * Used for both supervision sessions and team meetings.
 * @param {string} uniqueName - Room unique name (e.g. "supervision-123", "team-meeting-456")
 * @returns {Promise<{ roomSid: string, uniqueName: string } | null>}
 */
export async function createOrGetRoomByUniqueName(uniqueName) {
  const cfg = getVideoConfig();
  if (!cfg) return null;

  const name = String(uniqueName || '').trim();
  if (!name) return null;

  const client = TwilioService.getClient();

  try {
    const existing = await client.video.v1.rooms.list({ uniqueName: name, status: 'in-progress', limit: 1 });
    if (existing && existing.length > 0) {
      const room = existing[0];
      try {
        const transcriptions = await client.video.v1.rooms(room.sid).transcriptions.list();
        if (!transcriptions || transcriptions.length === 0) {
          await client.video.v1.rooms(room.sid).transcriptions.create({
            configuration: { languageCode: 'en-US', speechModel: 'long' }
          });
        }
      } catch {
        // ignore
      }
      return { roomSid: room.sid, uniqueName: room.uniqueName || name };
    }

    const createParams = {
      uniqueName: name,
      type: 'group',
      maxParticipants: 100,
      recordParticipantsOnConnect: true,
      transcribeParticipantsOnConnect: true,
      transcriptionsConfiguration: { languageCode: 'en-US', speechModel: 'long' },
      statusCallback: cfg.webhookUrl || undefined,
      statusCallbackMethod: cfg.webhookUrl ? 'POST' : undefined
    };

    const room = await client.video.v1.rooms.create(createParams);
    return { roomSid: room.sid, uniqueName: room.uniqueName || name };
  } catch (e) {
    console.error('[TwilioVideo] createOrGetRoomByUniqueName error:', e?.message);
    throw e;
  }
}

/**
 * Create or get a Twilio Video room for a supervision session.
 * Uses uniqueName = "supervision-{sessionId}" so the same room is reused.
 * @param {Object} opts
 * @param {number} opts.sessionId - supervision_sessions.id
 * @param {string} [opts.uniqueName] - Override (default: supervision-{sessionId})
 * @returns {Promise<{ roomSid: string, uniqueName: string } | null>}
 */
export async function createOrGetRoom({ sessionId, uniqueName }) {
  const name = uniqueName || `supervision-${sessionId}`;
  return createOrGetRoomByUniqueName(name);
}

/**
 * List connected participants in a Twilio Video room.
 * @param {string} roomUniqueNameOrSid - Room unique name (e.g. "supervision-6-lobby") or SID
 * @returns {Promise<Array<{ sid: string, identity: string }>>}
 */
/**
 * Update recording rules for a room.
 * Uses REST API directly (Twilio Node SDK may not expose recordingRules).
 * @param {string} roomSidOrName - Room SID or unique name
 * @param {Array<{type: 'include'|'exclude', all?: boolean, publisher?: string, kind?: 'audio'|'video'}>} rules
 * @returns {Promise<boolean>} true if successful
 */
export async function updateRecordingRules(roomSidOrName, rules) {
  const cfg = getVideoConfig();
  if (!cfg) return false;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return false;

  const url = `https://video.twilio.com/v1/Rooms/${encodeURIComponent(roomSidOrName)}/RecordingRules`;
  const body = new URLSearchParams({
    Rules: JSON.stringify(rules)
  }).toString();

  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`
      },
      body
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error('[TwilioVideo] updateRecordingRules failed:', resp.status, errText?.slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[TwilioVideo] updateRecordingRules error:', e?.message);
    return false;
  }
}

/**
 * Set recording to host-only (host's audio + video including screen).
 * @param {string} roomSidOrName - Room SID or unique name
 * @param {string} hostIdentity - Participant identity (e.g. "user-123")
 * @returns {Promise<boolean>}
 */
export async function setHostOnlyRecordingRules(roomSidOrName, hostIdentity) {
  const rules = [
    { type: 'exclude', all: true },
    { type: 'include', publisher: hostIdentity, kind: 'audio' },
    { type: 'include', publisher: hostIdentity, kind: 'video' }
  ];
  return updateRecordingRules(roomSidOrName, rules);
}

/**
 * Set recording to all participants (default).
 * @param {string} roomSidOrName - Room SID or unique name
 * @returns {Promise<boolean>}
 */
export async function setRecordAllRecordingRules(roomSidOrName) {
  const rules = [{ type: 'include', all: true }];
  return updateRecordingRules(roomSidOrName, rules);
}

export async function listRoomParticipants(roomUniqueNameOrSid) {
  const cfg = getVideoConfig();
  if (!cfg) return [];

  const client = TwilioService.getClient();
  try {
    const participants = await client.video.v1.rooms(roomUniqueNameOrSid).participants.list({ status: 'connected' });
    return (participants || []).map((p) => ({ sid: p.sid, identity: p.identity }));
  } catch (e) {
    console.error('[TwilioVideo] listRoomParticipants error:', e?.message);
    return [];
  }
}

/**
 * Generate an access token for a user to join a Twilio Video room.
 * If TWILIO_VIDEO_TOKEN_FUNCTION_URL is set, fetches token from that Twilio Function
 * (workaround for "Invalid Access Token issuer/subject" when local generation fails).
 * @param {Object} opts
 * @param {string} opts.identity - User identity (e.g. "user-123")
 * @param {string} opts.roomName - Room unique name or SID
 * @param {number} [opts.ttlSeconds=14400] - Token TTL (default 4 hours)
 * @returns {string | null} JWT token string (sync when using local generation)
 */
export function createAccessToken({ identity, roomName, ttlSeconds = 14400 }) {
  const cfg = getVideoConfig();
  if (!cfg) return null;

  const videoGrant = new VideoGrant({ room: roomName });
  const token = new AccessToken(cfg.accountSid, cfg.apiKeySid, cfg.apiKeySecret, {
    identity: String(identity || 'anonymous'),
    ttl: ttlSeconds
  });
  token.addGrant(videoGrant);
  return token.toJwt();
}

/**
 * Generate access token, optionally via Twilio Function URL.
 * Use when local token generation fails with "Invalid Access Token issuer/subject".
 * Set TWILIO_VIDEO_TOKEN_FUNCTION_URL to your deployed Function URL.
 * @returns {Promise<string | null>}
 */
/**
 * Compute X-Twilio-Signature for Protected Twilio Functions.
 * Algorithm: HMAC-SHA1(url + sorted params as key+value, authToken), base64.
 */
function computeTwilioSignature(url, params, authToken) {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const k of sortedKeys) {
    data += k + (params[k] ?? '');
  }
  const hmac = crypto.createHmac('sha1', authToken);
  hmac.update(data);
  return hmac.digest('base64');
}

export async function createAccessTokenAsync({ identity, roomName }) {
  const functionUrl = (process.env.TWILIO_VIDEO_TOKEN_FUNCTION_URL || '').trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN || '';
  if (functionUrl) {
    try {
      const params = {
        identity: String(identity || 'anonymous'),
        roomName: String(roomName || '')
      };
      const body = new URLSearchParams(params).toString();
      const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      if (authToken) {
        headers['X-Twilio-Signature'] = computeTwilioSignature(functionUrl, params, authToken);
      }
      const resp = await fetch(functionUrl, { method: 'POST', headers, body });
      const rawText = await resp.text();
      let data = (() => { try { return JSON.parse(rawText); } catch { return {}; } })();
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { data = {}; }
      }
      let tok = data?.token || data?.body?.token;
      if (!tok && typeof data?.body === 'string') {
        try { tok = JSON.parse(data.body)?.token; } catch { /* ignore */ }
      }
      if (!tok && resp.ok && rawText.includes('"token"')) {
        const m = rawText.match(/"token"\s*:\s*"([^"]+)"/);
        if (m?.[1]) tok = m[1];
      }
      if (tok) {
        const parts = String(tok).split('.');
        if (parts.length !== 3) {
          console.warn('[TwilioVideo] Token malformed (expected 3 JWT parts, got', parts.length, ')');
          tok = null;
        }
      }
      if (tok) return tok;
      console.warn('[TwilioVideo] Token Function failed:', resp.status, 'body:', rawText?.slice(0, 200) || '(empty)');
      return null; // Do NOT fall back to local - Twilio rejects local tokens with "authorization failed"
    } catch (e) {
      console.error('[TwilioVideo] Token Function fetch error:', e?.message);
      return null;
    }
  }
  return createAccessToken({ identity, roomName });
}
