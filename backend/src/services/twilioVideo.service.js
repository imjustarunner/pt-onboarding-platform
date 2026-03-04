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
      maxParticipants: 10,
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
export async function createAccessTokenAsync({ identity, roomName }) {
  const functionUrl = (process.env.TWILIO_VIDEO_TOKEN_FUNCTION_URL || '').trim();
  if (functionUrl) {
    try {
      const resp = await fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: String(identity || 'anonymous'), roomName })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.token) return data.token;
      }
    } catch (e) {
      console.error('[TwilioVideo] Token Function fetch error:', e?.message);
    }
  }
  return createAccessToken({ identity, roomName });
}
