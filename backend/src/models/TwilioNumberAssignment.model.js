import pool from '../config/database.js';

class TwilioNumberAssignment {
  static async listByUserId(userId) {
    const [rows] = await pool.execute(
      `SELECT tna.*, tn.phone_number, tn.agency_id, tn.status, tn.is_active AS number_active
       FROM twilio_number_assignments tna
       JOIN twilio_numbers tn ON tn.id = tna.number_id
       WHERE tna.user_id = ? AND tna.is_active = TRUE AND tn.is_active = TRUE AND tn.status <> 'released'
       ORDER BY tna.is_primary DESC, tna.created_at DESC`,
      [userId]
    );
    return rows;
  }

  static async listByNumberId(numberId) {
    const [rows] = await pool.execute(
      `SELECT * FROM twilio_number_assignments WHERE number_id = ? AND is_active = TRUE ORDER BY is_primary DESC`,
      [numberId]
    );
    return rows;
  }

  static async findPrimaryForUser(userId) {
    const [rows] = await pool.execute(
      `SELECT tna.*, tn.phone_number, tn.agency_id
       FROM twilio_number_assignments tna
       JOIN twilio_numbers tn ON tn.id = tna.number_id
       WHERE tna.user_id = ? AND tna.is_active = TRUE AND tna.is_primary = TRUE
         AND tn.is_active = TRUE AND tn.status <> 'released'
       LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  }

  static async assign({ numberId, userId, isPrimary = true, replaceExisting = true }) {
    if (replaceExisting) {
      // Legacy single-owner mode: deactivate any existing assignment for this number
      await pool.execute(
        `UPDATE twilio_number_assignments
         SET is_active = FALSE, is_primary = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE number_id = ?`,
        [numberId]
      );
    }
    const [result] = await pool.execute(
      `INSERT INTO twilio_number_assignments (number_id, user_id, is_primary, sms_access_enabled, is_active)
       VALUES (?, ?, ?, TRUE, TRUE)
       ON DUPLICATE KEY UPDATE is_active = TRUE, is_primary = VALUES(is_primary), sms_access_enabled = COALESCE(sms_access_enabled, TRUE), updated_at = CURRENT_TIMESTAMP`,
      [numberId, userId, isPrimary ? 1 : 0]
    );
    const id = result.insertId;
    if (id) {
      const [rows] = await pool.execute('SELECT * FROM twilio_number_assignments WHERE id = ?', [id]);
      return rows[0] || null;
    }
    const [rows] = await pool.execute(
      'SELECT * FROM twilio_number_assignments WHERE number_id = ? AND user_id = ? LIMIT 1',
      [numberId, userId]
    );
    return rows[0] || null;
  }

  static async unassign({ numberId, userId }) {
    await pool.execute(
      `UPDATE twilio_number_assignments
       SET is_active = FALSE, is_primary = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE number_id = ? AND user_id = ?`,
      [numberId, userId]
    );
    return true;
  }

  /** Add user to SMS pool without removing others. For multi-recipient mode. */
  static async addToPool({ numberId, userId, smsAccessEnabled = true, isPrimary = false }) {
    const [result] = await pool.execute(
      `INSERT INTO twilio_number_assignments (number_id, user_id, is_primary, sms_access_enabled, is_active)
       VALUES (?, ?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE is_active = TRUE, sms_access_enabled = VALUES(sms_access_enabled), is_primary = VALUES(is_primary), updated_at = CURRENT_TIMESTAMP`,
      [numberId, userId, isPrimary ? 1 : 0, smsAccessEnabled ? 1 : 0]
    );
    const id = result.insertId;
    if (id) {
      const [rows] = await pool.execute('SELECT * FROM twilio_number_assignments WHERE id = ?', [id]);
      return rows[0] || null;
    }
    const [rows] = await pool.execute(
      'SELECT * FROM twilio_number_assignments WHERE number_id = ? AND user_id = ? LIMIT 1',
      [numberId, userId]
    );
    return rows[0] || null;
  }

  /** Toggle SMS access for a user on a number. */
  static async setSmsAccess({ numberId, userId, enabled }) {
    await pool.execute(
      `UPDATE twilio_number_assignments
       SET sms_access_enabled = ?, updated_at = CURRENT_TIMESTAMP
       WHERE number_id = ? AND user_id = ? AND is_active = TRUE`,
      [enabled ? 1 : 0, numberId, userId]
    );
    const [rows] = await pool.execute(
      'SELECT * FROM twilio_number_assignments WHERE number_id = ? AND user_id = ? LIMIT 1',
      [numberId, userId]
    );
    return rows[0] || null;
  }

  /** List user IDs eligible to receive inbound SMS for this number (sms_access_enabled = TRUE). */
  static async listEligibleUserIdsForNumber(numberId) {
    const [rows] = await pool.execute(
      `SELECT user_id FROM twilio_number_assignments
       WHERE number_id = ? AND is_active = TRUE AND (sms_access_enabled = TRUE OR sms_access_enabled IS NULL)
       ORDER BY is_primary DESC, created_at ASC`,
      [numberId]
    );
    return rows.map((r) => r.user_id);
  }
}

export default TwilioNumberAssignment;
