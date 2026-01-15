import pool from '../config/database.js';

class MessageLog {
  static normalizePhone(phone) {
    if (!phone) return null;
    const str = String(phone).trim();
    if (str.startsWith('+')) return '+' + str.slice(1).replace(/[^\d]/g, '');
    const digits = str.replace(/[^\d]/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return digits ? `+${digits}` : null;
  }

  static async createInbound({
    agencyId = null,
    userId,
    clientId = null,
    body,
    fromNumber,
    toNumber,
    twilioMessageSid = null,
    metadata = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO message_logs
       (agency_id, user_id, client_id, direction, body, from_number, to_number, twilio_message_sid, delivery_status, metadata)
       VALUES (?, ?, ?, 'INBOUND', ?, ?, ?, ?, 'received', ?)`,
      [
        agencyId,
        userId,
        clientId,
        body,
        this.normalizePhone(fromNumber) || fromNumber,
        this.normalizePhone(toNumber) || toNumber,
        twilioMessageSid,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async createOutbound({
    agencyId = null,
    userId,
    clientId = null,
    body,
    fromNumber,
    toNumber,
    twilioMessageSid = null,
    deliveryStatus = 'pending',
    metadata = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO message_logs
       (agency_id, user_id, client_id, direction, body, from_number, to_number, twilio_message_sid, delivery_status, metadata)
       VALUES (?, ?, ?, 'OUTBOUND', ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        userId,
        clientId,
        body,
        this.normalizePhone(fromNumber) || fromNumber,
        this.normalizePhone(toNumber) || toNumber,
        twilioMessageSid,
        deliveryStatus,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async markSent(id, sid = null, metadata = null) {
    await pool.execute(
      `UPDATE message_logs
       SET delivery_status = 'sent',
           twilio_message_sid = COALESCE(twilio_message_sid, ?),
           metadata = COALESCE(?, metadata)
       WHERE id = ?`,
      [sid, metadata ? JSON.stringify(metadata) : null, id]
    );
    return this.findById(id);
  }

  static async markFailed(id, errorMessage) {
    const metadata = { error: errorMessage };
    await pool.execute(
      `UPDATE message_logs
       SET delivery_status = 'failed',
           metadata = COALESCE(?, metadata)
       WHERE id = ?`,
      [JSON.stringify(metadata), id]
    );
    return this.findById(id);
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM message_logs WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async listRecentForAgency(agencyId, { limit = 50 } = {}) {
    const [rows] = await pool.execute(
      `SELECT ml.*,
              c.initials AS client_initials,
              u.first_name AS user_first_name,
              u.last_name AS user_last_name
       FROM message_logs ml
       LEFT JOIN clients c ON ml.client_id = c.id
       LEFT JOIN users u ON ml.user_id = u.id
       WHERE ml.agency_id = ?
       ORDER BY ml.created_at DESC
       LIMIT ?`,
      [agencyId, limit]
    );
    return rows;
  }

  static async listThread({ userId, clientId, limit = 100 }) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM message_logs
       WHERE user_id = ? AND client_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, clientId, limit]
    );
    return rows;
  }
}

export default MessageLog;

