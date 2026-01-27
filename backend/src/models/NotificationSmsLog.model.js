import pool from '../config/database.js';

class NotificationSmsLog {
  static async create({
    userId,
    agencyId,
    notificationId = null,
    toNumber,
    fromNumber,
    body,
    twilioSid = null,
    status = 'pending',
    errorMessage = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO notification_sms_logs
       (user_id, agency_id, notification_id, to_number, from_number, body, twilio_sid, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, agencyId, notificationId, toNumber, fromNumber, body, twilioSid, status, errorMessage]
    );
    return this.findById(result.insertId);
  }

  static async updateStatus(id, { status, twilioSid = null, errorMessage = null }) {
    const fields = [];
    const values = [];
    if (status) {
      fields.push('status = ?');
      values.push(status);
    }
    if (twilioSid !== null) {
      fields.push('twilio_sid = ?');
      values.push(twilioSid);
    }
    if (errorMessage !== null) {
      fields.push('error_message = ?');
      values.push(errorMessage);
    }
    if (fields.length === 0) return this.findById(id);
    values.push(id);
    await pool.execute(`UPDATE notification_sms_logs SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM notification_sms_logs WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async findByUser(userId, { limit = 100, offset = 0 } = {}) {
    const [rows] = await pool.execute(
      `SELECT * FROM notification_sms_logs
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );
    return rows;
  }

  static async findByAgency(agencyId, { limit = 200, offset = 0 } = {}) {
    const [rows] = await pool.execute(
      `SELECT * FROM notification_sms_logs
       WHERE agency_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [agencyId, limit, offset]
    );
    return rows;
  }

  static async purgeByAgency(agencyId) {
    const [result] = await pool.execute('DELETE FROM notification_sms_logs WHERE agency_id = ?', [agencyId]);
    return result.affectedRows || 0;
  }

  static async purgeAll() {
    const [result] = await pool.execute('DELETE FROM notification_sms_logs');
    return result.affectedRows || 0;
  }
}

export default NotificationSmsLog;

