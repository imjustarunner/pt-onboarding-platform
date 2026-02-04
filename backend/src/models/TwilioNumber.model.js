import pool from '../config/database.js';

class TwilioNumber {
  static normalizePhone(phone) {
    if (!phone) return null;
    const str = String(phone).trim();
    if (str.startsWith('+')) return '+' + str.slice(1).replace(/[^\d]/g, '');
    const digits = str.replace(/[^\d]/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return digits ? `+${digits}` : null;
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM twilio_numbers WHERE id = ? LIMIT 1', [id]);
    return rows[0] || null;
  }

  static async findByPhoneNumber(phoneNumber) {
    const phone = this.normalizePhone(phoneNumber);
    if (!phone) return null;
    const [rows] = await pool.execute('SELECT * FROM twilio_numbers WHERE phone_number = ? LIMIT 1', [phone]);
    return rows[0] || null;
  }

  static async listByAgency(agencyId, { includeInactive = false } = {}) {
    const whereActive = includeInactive ? '' : ' AND is_active = TRUE AND status <> \'released\'';
    const [rows] = await pool.execute(
      `SELECT * FROM twilio_numbers WHERE agency_id = ?${whereActive} ORDER BY created_at DESC`,
      [agencyId]
    );
    return rows;
  }

  static async create({ agencyId = null, phoneNumber, twilioSid = null, friendlyName = null, capabilities = null, status = 'active' }) {
    const phone = this.normalizePhone(phoneNumber) || phoneNumber;
    const [result] = await pool.execute(
      `INSERT INTO twilio_numbers (agency_id, phone_number, twilio_sid, friendly_name, capabilities, status, is_active)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
      [agencyId, phone, twilioSid, friendlyName, capabilities ? JSON.stringify(capabilities) : null, status]
    );
    return this.findById(result.insertId);
  }

  static async markReleased(id) {
    await pool.execute(
      `UPDATE twilio_numbers
       SET status = 'released', is_active = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [id]
    );
    return this.findById(id);
  }

  static async updateCapabilities(id, capabilities) {
    await pool.execute(
      `UPDATE twilio_numbers
       SET capabilities = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [capabilities ? JSON.stringify(capabilities) : null, id]
    );
    return this.findById(id);
  }
}

export default TwilioNumber;
