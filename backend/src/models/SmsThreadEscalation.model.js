import pool from '../config/database.js';
import MessageLog from './MessageLog.model.js';

class SmsThreadEscalation {
  static normalizePhone(phone) {
    return MessageLog.normalizePhone(phone);
  }

  static async findActive({ userId, clientId }) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM sms_thread_escalations
       WHERE user_id = ? AND client_id = ? AND is_active = TRUE
       ORDER BY id DESC
       LIMIT 1`,
      [userId, clientId]
    );
    return rows[0] || null;
  }

  static async createOrKeep({
    agencyId = null,
    userId,
    clientId,
    inboundLogId = null,
    escalatedToPhone = null,
    escalationType = 'sla_timeout',
    threadMode = 'respondable',
    metadata = null
  }) {
    if (!userId || !clientId) throw new Error('userId and clientId are required');
    if (inboundLogId) {
      const [existing] = await pool.execute(
        'SELECT * FROM sms_thread_escalations WHERE inbound_log_id = ? LIMIT 1',
        [inboundLogId]
      );
      if (existing?.[0]) return existing[0];
    }
    const active = await this.findActive({ userId, clientId });
    if (active) return active;

    const [result] = await pool.execute(
      `INSERT INTO sms_thread_escalations
       (agency_id, user_id, client_id, inbound_log_id, escalated_to_phone, escalation_type, thread_mode, is_active, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, ?)`,
      [
        agencyId,
        userId,
        clientId,
        inboundLogId,
        this.normalizePhone(escalatedToPhone) || escalatedToPhone || null,
        escalationType,
        threadMode === 'read_only' ? 'read_only' : 'respondable',
        metadata ? JSON.stringify(metadata) : null
      ]
    );
    const [rows] = await pool.execute('SELECT * FROM sms_thread_escalations WHERE id = ?', [result.insertId]);
    return rows[0] || null;
  }

  static async resolveActive({ userId, clientId }) {
    await pool.execute(
      `UPDATE sms_thread_escalations
       SET is_active = FALSE, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND client_id = ? AND is_active = TRUE`,
      [userId, clientId]
    );
    return true;
  }
}

export default SmsThreadEscalation;

