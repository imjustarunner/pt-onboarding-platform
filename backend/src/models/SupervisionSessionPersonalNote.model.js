import pool from '../config/database.js';
import {
  encryptPersonalNoteText,
  isSupervisionPersonalNoteEncryptionConfigured,
  resolvePersonalNotePlaintext
} from '../services/supervisionPersonalNoteEncryption.service.js';

function mapRow(row) {
  if (!row) return null;
  return {
    sessionId: Number(row.session_id || 0),
    userId: Number(row.user_id || 0),
    noteText: resolvePersonalNotePlaintext(row),
    isEncrypted: !!(row.note_ciphertext && row.note_iv && row.note_auth_tag),
    updatedAt: row.updated_at || null
  };
}

class SupervisionSessionPersonalNote {
  static async findBySessionAndUser({ sessionId, userId }) {
    const sid = parseInt(sessionId, 10);
    const uid = parseInt(userId, 10);
    if (!sid || !uid) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM supervision_session_personal_notes
       WHERE session_id = ? AND user_id = ?
       LIMIT 1`,
      [sid, uid]
    );
    return mapRow(rows?.[0] || null);
  }

  static async upsertBySessionAndUser({ sessionId, userId, noteText }) {
    const sid = parseInt(sessionId, 10);
    const uid = parseInt(userId, 10);
    if (!sid || !uid) return null;

    const text = String(noteText || '').slice(0, 120000);
    const enc = encryptPersonalNoteText(text);
    const useEncryption = !!enc && isSupervisionPersonalNoteEncryptionConfigured();

    await pool.execute(
      `INSERT INTO supervision_session_personal_notes
        (session_id, user_id, note_text, note_ciphertext, note_iv, note_auth_tag, encryption_key_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         note_text = VALUES(note_text),
         note_ciphertext = VALUES(note_ciphertext),
         note_iv = VALUES(note_iv),
         note_auth_tag = VALUES(note_auth_tag),
         encryption_key_id = VALUES(encryption_key_id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        sid,
        uid,
        useEncryption ? null : (text || null),
        useEncryption ? enc.ciphertextB64 : null,
        useEncryption ? enc.ivB64 : null,
        useEncryption ? enc.authTagB64 : null,
        useEncryption ? enc.keyId : null
      ]
    );

    return this.findBySessionAndUser({ sessionId: sid, userId: uid });
  }
}

export default SupervisionSessionPersonalNote;
