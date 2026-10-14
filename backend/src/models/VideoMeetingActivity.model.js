/**
 * Video meeting activity: chat, polls, Q&A persisted for meeting owners.
 * Supports supervision sessions (session_id) and team meetings (event_id).
 * Payload encryption is required for every write.
 */

import pool from '../config/database.js';
import { encryptPayload, decryptPayload } from '../services/videoActivityEncryption.service.js';

export default class VideoMeetingActivity {
  // A reserved server-written identity separates the displayed interview question
  // from participant Q&A and private staff material. Latest id wins, including clear.
  static async latestInterviewQuestion(eventId) {
    const [rows] = await pool.execute(`SELECT id, payload_json, payload_ciphertext, payload_iv,
      payload_auth_tag, encryption_key_id FROM video_meeting_activity
      WHERE event_id = ? AND activity_type = 'question'
        AND participant_identity = 'interview-question-display'
      ORDER BY id DESC LIMIT 1`, [eventId]);
    const row = rows[0];
    return row ? { id: Number(row.id), text: decryptPayload(row, {}).text || '' } : { id: 0, text: '' };
  }
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
    // Use an empty object for the legacy NOT NULL column; never duplicate content.
    const payloadJson = '{}';
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
   * @param {{ sessionId?: number, eventId?: number, limit?: number, offset?: number }}
   */
  static async list({ sessionId, eventId, limit = 500, offset = 0 }) {
    const sid = sessionId ? parseInt(sessionId, 10) : null;
    const eid = eventId ? parseInt(eventId, 10) : null;
    const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1000);

    if (!sid && !eid) return [];

    const skip = Math.max(0, Math.min(1000000, Math.floor(Number(offset) || 0)));
    const where = sid ? 'session_id = ?' : 'event_id = ?';
    // mysql2 prepared statements reject LIMIT ? on some servers ("Incorrect arguments to mysqld_stmt_execute").
    // lim is already clamped to an integer 1..1000 above.
    const [rows] = await pool.execute(
      `SELECT id, session_id, event_id, user_id, participant_identity, activity_type, payload_json,
              payload_ciphertext, payload_iv, payload_auth_tag, encryption_key_id, created_at
       FROM video_meeting_activity
       WHERE ${where}
       ORDER BY created_at ASC, id ASC
       LIMIT ${lim} OFFSET ${skip}`,
      [sid || eid]
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
