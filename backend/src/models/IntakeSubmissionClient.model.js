import pool from '../config/database.js';

class IntakeSubmissionClient {
  static async create(data) {
    const { intakeSubmissionId, clientId = null, fullName = null, initials = null, contactPhone = null } = data;
    const [result] = await pool.execute(
      `INSERT INTO intake_submission_clients
       (intake_submission_id, client_id, full_name, initials, contact_phone)
       VALUES (?, ?, ?, ?, ?)`,
      [intakeSubmissionId, clientId, fullName, initials, contactPhone]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM intake_submission_clients WHERE id = ? LIMIT 1',
      [id]
    );
    return rows[0] || null;
  }

  static async listBySubmissionId(intakeSubmissionId) {
    const [rows] = await pool.execute(
      `SELECT * FROM intake_submission_clients
       WHERE intake_submission_id = ?
       ORDER BY id ASC`,
      [intakeSubmissionId]
    );
    return rows;
  }

  static async updateById(id, updates) {
    if (!id || !updates) return this.findById(id);
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(val);
    }
    if (!fields.length) return this.findById(id);
    values.push(id);
    await pool.execute(`UPDATE intake_submission_clients SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }
}

export default IntakeSubmissionClient;
