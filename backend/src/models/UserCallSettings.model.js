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
    const waitMusicId = patch.wait_music_id ? String(patch.wait_music_id).trim() : null;
    const voicemailEnabled = patch.voicemail_enabled !== undefined ? !!patch.voicemail_enabled : false;
    const vacationModeEnabled = patch.vacation_mode_enabled !== undefined ? !!patch.vacation_mode_enabled : false;
    const voicemailMessage = patch.voicemail_message ? String(patch.voicemail_message).trim() : null;
    const voicemailOooMessage = patch.voicemail_ooo_message ? String(patch.voicemail_ooo_message).trim() : null;
    const voicemailVacationMessage = patch.voicemail_vacation_message ? String(patch.voicemail_vacation_message).trim() : null;
    const forwardToPhone = patch.forward_to_phone ? this.normalizePhone(patch.forward_to_phone) || patch.forward_to_phone : null;
    const smsInboundEnabled = patch.sms_inbound_enabled !== undefined ? !!patch.sms_inbound_enabled : true;
    const smsOutboundEnabled = patch.sms_outbound_enabled !== undefined ? !!patch.sms_outbound_enabled : true;

    try {
      await pool.execute(
        `INSERT INTO user_call_settings (
           user_id, inbound_enabled, outbound_enabled, forward_to_phone, 
           allow_call_recording, wait_music_id, 
           voicemail_enabled, vacation_mode_enabled,
           voicemail_message, voicemail_ooo_message, voicemail_vacation_message,
           sms_inbound_enabled, sms_outbound_enabled
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           inbound_enabled = COALESCE(VALUES(inbound_enabled), inbound_enabled),
           outbound_enabled = COALESCE(VALUES(outbound_enabled), outbound_enabled),
           forward_to_phone = VALUES(forward_to_phone),
           allow_call_recording = COALESCE(VALUES(allow_call_recording), allow_call_recording),
           wait_music_id = VALUES(wait_music_id),
           voicemail_enabled = COALESCE(VALUES(voicemail_enabled), voicemail_enabled),
           vacation_mode_enabled = COALESCE(VALUES(vacation_mode_enabled), vacation_mode_enabled),
           voicemail_message = VALUES(voicemail_message),
           voicemail_ooo_message = VALUES(voicemail_ooo_message),
           voicemail_vacation_message = VALUES(voicemail_vacation_message),
           sms_inbound_enabled = COALESCE(VALUES(sms_inbound_enabled), sms_inbound_enabled),
           sms_outbound_enabled = COALESCE(VALUES(sms_outbound_enabled), sms_outbound_enabled),
           updated_at = CURRENT_TIMESTAMP`,
        [
          userId,
          inboundEnabled ? 1 : 0,
          outboundEnabled ? 1 : 0,
          forwardToPhone,
          allowCallRecording ? 1 : 0,
          waitMusicId,
          voicemailEnabled ? 1 : 0,
          vacationModeEnabled ? 1 : 0,
          voicemailMessage,
          voicemailOooMessage,
          voicemailVacationMessage,
          smsInboundEnabled ? 1 : 0,
          smsOutboundEnabled ? 1 : 0
        ]
      );
    } catch (err) {
      // Fallback for missing columns (e.g. if migration hasn't run in some envs)
      const isMissingCol = err?.message?.includes('Unknown column');
      if (isMissingCol) {
        // Attempt simpler upsert with core fields only
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
      } else {
        throw err;
      }
    }

    return this.getByUserId(userId);
  }
}

export default UserCallSettings;

