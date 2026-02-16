import pool from '../config/database.js';
import MessageLog from './MessageLog.model.js';

class UserCallSettings {
  static normalizePhone(phone) {
    return MessageLog.normalizePhone(phone);
  }

  static async getByUserId(userId) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM user_call_settings
       WHERE user_id = ?
       LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  }

  static async upsertForUser(userId, patch = {}) {
    const inboundEnabled = patch.inbound_enabled !== undefined ? !!patch.inbound_enabled : true;
    const outboundEnabled = patch.outbound_enabled !== undefined ? !!patch.outbound_enabled : true;
    const allowCallRecording = patch.allow_call_recording !== undefined ? !!patch.allow_call_recording : false;
    const voicemailEnabled = patch.voicemail_enabled !== undefined ? !!patch.voicemail_enabled : false;
    const voicemailMessage = patch.voicemail_message ? String(patch.voicemail_message).trim() : null;
    const forwardToPhone = patch.forward_to_phone ? this.normalizePhone(patch.forward_to_phone) || patch.forward_to_phone : null;

    await pool.execute(
      `INSERT INTO user_call_settings (user_id, inbound_enabled, outbound_enabled, forward_to_phone, allow_call_recording, voicemail_enabled, voicemail_message)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         inbound_enabled = COALESCE(VALUES(inbound_enabled), inbound_enabled),
         outbound_enabled = COALESCE(VALUES(outbound_enabled), outbound_enabled),
         forward_to_phone = VALUES(forward_to_phone),
         allow_call_recording = COALESCE(VALUES(allow_call_recording), allow_call_recording),
         voicemail_enabled = COALESCE(VALUES(voicemail_enabled), voicemail_enabled),
         voicemail_message = VALUES(voicemail_message),
         updated_at = CURRENT_TIMESTAMP`,
      [
        userId,
        inboundEnabled ? 1 : 0,
        outboundEnabled ? 1 : 0,
        forwardToPhone,
        allowCallRecording ? 1 : 0,
        voicemailEnabled ? 1 : 0,
        voicemailMessage
      ]
    );

    return this.getByUserId(userId);
  }
}

export default UserCallSettings;

