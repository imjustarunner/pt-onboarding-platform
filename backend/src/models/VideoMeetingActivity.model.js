/**
 * Video meeting activity: chat, polls, Q&A persisted for meeting owners.
 * Supports supervision sessions (session_id) and team meetings (event_id).
 * When CLIENT_CHAT_ENCRYPTION_KEY_BASE64 is set, payload is encrypted at rest.
 */

import pool from '../config/database.js';
import { encryptPayload, decryptPayload } from '../services/videoActivityEncryption.service.js';

export default class VideoMeetingActivity {
  /**
   * Insert a chat/poll/Q&A activity.
   * @param {{ sessionId?: number, eventId?: number, userId?: number, participantIdentity: string, activityType: string, payload: object }}
   */
  static async create({ sessionId, eventId, userId, participantIdentity, activityType, payload }) {
    const sid = sessionId ? parseInt(sessionId, 10) : null;
    const eid = eventId ? parseInt(eventId, 10) : null;
    const uid = userId ? parseInt(userId, 10) : null;
    const identity = String(participantIdentity || '').trim();
    const type = String(activityType || 'chat').toLowerCase();

    if ((!sid && !eid) || !identity || !['chat', 'poll', 'poll_vote', 'question', 'answer'].includes(type)) {
      return null;
    }

    const enc = encryptPayload(payload || {});
    const payloadJson = enc ? null : JSON.stringify(payload || {});
    const payloadCiphertext = enc?.ciphertextB64 ?? null;
    const payloadIv = enc?.ivB64 ?? null;
    const payloadAuthTag = enc?.authTagB64 ?? null;
    const encryptionKeyId = enc?.keyId ?? null;

    const [result] = await pool.execute(
      `INSERT INTO video_meeting_activity
        (session_id, event_id, user_id, participant_identity, activity_type, payload_json, payload_ciphertext, payload_iv, payload_auth_tag, encryption_key_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sid, eid, uid, identity, type, payloadJson, payloadCiphertext, payloadIv, payloadAuthTag, encryptionKeyId]
    );

    return result?.insertId ?? null;
  }

  /**
   * List activity for a session or event (for meeting owner to view later).
   * @param {{ sessionId?: number, eventId?: number, limit?: number }}
   */
  static async list({ sessionId, eventId, limit = 500 }) {
    const sid = sessionId ? parseInt(sessionId, 10) : null;
    const eid = eventId ? parseInt(eventId, 10) : null;
    const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1000);

    if (!sid && !eid) return [];

    const where = sid ? 'session_id = ?' : 'event_id = ?';
    const args = [sid || eid, lim];

    const [rows] = await pool.execute(
      `SELECT id, session_id, event_id, user_id, participant_identity, activity_type, payload_json,
              payload_ciphertext, payload_iv, payload_auth_tag, encryption_key_id, created_at
       FROM video_meeting_activity
       WHERE ${where}
       ORDER BY created_at ASC
       LIMIT ?`,
      args
    );

    return (rows || []).map((r) => ({
      id: Number(r.id),
      sessionId: r.session_id ? Number(r.session_id) : null,
      eventId: r.event_id ? Number(r.event_id) : null,
      userId: r.user_id ? Number(r.user_id) : null,
      participantIdentity: r.participant_identity,
      activityType: r.activity_type,
      payload: decryptPayload(r, {}),
      createdAt: r.created_at
    }));
  }
}
