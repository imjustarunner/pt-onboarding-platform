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

  static async assign({ numberId, userId, isPrimary = true }) {
    // Deactivate any existing assignment for this number
    await pool.execute(
      `UPDATE twilio_number_assignments
       SET is_active = FALSE, is_primary = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE number_id = ?`,
      [numberId]
    );
    const [result] = await pool.execute(
      `INSERT INTO twilio_number_assignments (number_id, user_id, is_primary, is_active)
       VALUES (?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE is_active = TRUE, is_primary = VALUES(is_primary), updated_at = CURRENT_TIMESTAMP`,
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
}

export default TwilioNumberAssignment;
