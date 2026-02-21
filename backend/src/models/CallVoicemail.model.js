import pool from '../config/database.js';
import MessageLog from './MessageLog.model.js';

class CallVoicemail {
  static normalizePhone(phone) {
    return MessageLog.normalizePhone(phone);
  }

  static async create({
    callLogId = null,
    agencyId = null,
    userId = null,
    clientId = null,
    fromNumber = null,
    toNumber = null,
    recordingSid,
    recordingUrl = null,
    durationSeconds = null,
    status = null,
    transcriptionText = null
  }) {
    if (!recordingSid) throw new Error('recordingSid is required');
    await pool.execute(
      `INSERT INTO call_voicemails
       (call_log_id, agency_id, user_id, client_id, from_number, to_number, twilio_recording_sid, recording_url, duration_seconds, status, transcription_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         recording_url = VALUES(recording_url),
         duration_seconds = VALUES(duration_seconds),
         status = VALUES(status),
         transcription_text = VALUES(transcription_text),
         updated_at = CURRENT_TIMESTAMP`,
      [
        callLogId,
        agencyId,
        userId,
        clientId,
        this.normalizePhone(fromNumber) || fromNumber,
        this.normalizePhone(toNumber) || toNumber,
        recordingSid,
        recordingUrl,
        Number.isFinite(Number(durationSeconds)) ? Number(durationSeconds) : null,
        status || null,
        transcriptionText || null
      ]
    );
    return this.findByRecordingSid(recordingSid);
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM call_voicemails WHERE id = ? LIMIT 1', [id]);
    return rows[0] || null;
  }

  static async findByRecordingSid(recordingSid) {
    const [rows] = await pool.execute(
      'SELECT * FROM call_voicemails WHERE twilio_recording_sid = ? LIMIT 1',
      [recordingSid]
    );
    return rows[0] || null;
  }

  static async markListened(id) {
    await pool.execute(
      `UPDATE call_voicemails
       SET listened_at = COALESCE(listened_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [id]
    );
    return this.findById(id);
  }

  static async updateTranscription(id, transcriptionText) {
    await pool.execute(
      `UPDATE call_voicemails
       SET transcription_text = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [transcriptionText || null, id]
    );
    return this.findById(id);
  }
}

export default CallVoicemail;

