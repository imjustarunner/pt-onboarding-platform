import pool from '../config/database.js';
import MessageLog from './MessageLog.model.js';

class CallLog {
  static normalizePhone(phone) {
    return MessageLog.normalizePhone(phone);
  }

  static async create({
    agencyId = null,
    numberId = null,
    userId = null,
    clientId = null,
    direction,
    fromNumber = null,
    toNumber = null,
    targetPhone = null,
    twilioCallSid = null,
    parentCallSid = null,
    status = null,
    durationSeconds = null,
    startedAt = null,
    answeredAt = null,
    endedAt = null,
    metadata = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO call_logs
       (agency_id, number_id, user_id, client_id, direction, from_number, to_number, target_phone, twilio_call_sid, parent_call_sid, status, duration_seconds, started_at, answered_at, ended_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        numberId,
        userId,
        clientId,
        direction,
        this.normalizePhone(fromNumber) || fromNumber,
        this.normalizePhone(toNumber) || toNumber,
        this.normalizePhone(targetPhone) || targetPhone,
        twilioCallSid,
        parentCallSid,
        status,
        Number.isFinite(Number(durationSeconds)) ? Number(durationSeconds) : null,
        startedAt || null,
        answeredAt || null,
        endedAt || null,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM call_logs WHERE id = ? LIMIT 1', [id]);
    return rows[0] || null;
  }

  static async findBySid(sid) {
    if (!sid) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM call_logs
       WHERE twilio_call_sid = ? OR parent_call_sid = ?
       ORDER BY id DESC
       LIMIT 1`,
      [sid, sid]
    );
    return rows[0] || null;
  }

  static async updateById(id, patch = {}) {
    const fields = [];
    const values = [];

    const set = (field, value) => {
      fields.push(`${field} = ?`);
      values.push(value);
    };

    if (patch.twilio_call_sid !== undefined) set('twilio_call_sid', patch.twilio_call_sid || null);
    if (patch.parent_call_sid !== undefined) set('parent_call_sid', patch.parent_call_sid || null);
    if (patch.status !== undefined) set('status', patch.status || null);
    if (patch.duration_seconds !== undefined) {
      const n = Number(patch.duration_seconds);
      set('duration_seconds', Number.isFinite(n) ? n : null);
    }
    if (patch.started_at !== undefined) set('started_at', patch.started_at || null);
    if (patch.answered_at !== undefined) set('answered_at', patch.answered_at || null);
    if (patch.ended_at !== undefined) set('ended_at', patch.ended_at || null);
    if (patch.target_phone !== undefined) set('target_phone', this.normalizePhone(patch.target_phone) || patch.target_phone || null);
    if (patch.metadata !== undefined) {
      set('metadata', patch.metadata ? JSON.stringify(patch.metadata) : null);
    }

    if (!fields.length) return this.findById(id);
    values.push(id);
    await pool.execute(
      `UPDATE call_logs
       SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      values
    );
    return this.findById(id);
  }
}

export default CallLog;

