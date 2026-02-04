import pool from '../config/database.js';

class TwilioOptInState {
  static async findByClientNumber({ clientId, numberId }) {
    const [rows] = await pool.execute(
      `SELECT * FROM twilio_opt_in_state WHERE client_id = ? AND number_id = ? LIMIT 1`,
      [clientId, numberId]
    );
    return rows[0] || null;
  }

  static async upsert({ agencyId = null, clientId, numberId, status = 'pending', source = null }) {
    const [existing] = await pool.execute(
      `SELECT id FROM twilio_opt_in_state WHERE client_id = ? AND number_id = ? LIMIT 1`,
      [clientId, numberId]
    );
    if (existing?.[0]?.id) {
      await pool.execute(
        `UPDATE twilio_opt_in_state
         SET status = ?, source = ?, last_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [status, source, existing[0].id]
      );
      const [rows] = await pool.execute('SELECT * FROM twilio_opt_in_state WHERE id = ?', [existing[0].id]);
      return rows[0] || null;
    }
    const [result] = await pool.execute(
      `INSERT INTO twilio_opt_in_state (agency_id, number_id, client_id, status, source)
       VALUES (?, ?, ?, ?, ?)`,
      [agencyId, numberId, clientId, status, source]
    );
    const [rows] = await pool.execute('SELECT * FROM twilio_opt_in_state WHERE id = ?', [result.insertId]);
    return rows[0] || null;
  }
}

export default TwilioOptInState;
