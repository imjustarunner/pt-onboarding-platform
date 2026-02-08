import pool from '../config/database.js';

class IntakeSubmission {
  static async create(data) {
    const {
      intakeLinkId,
      status = 'started',
      signerName = null,
      signerInitials = null,
      signerEmail = null,
      signerPhone = null,
      intakeData = null,
      intakeDataHash = null,
      consentGivenAt = null,
      submittedAt = null,
      ipAddress = null,
      userAgent = null,
      clientId = null,
      guardianUserId = null,
      combinedPdfPath = null,
      combinedPdfHash = null,
      retentionExpiresAt = null
    } = data;

    const [result] = await pool.execute(
      `INSERT INTO intake_submissions
       (intake_link_id, status, signer_name, signer_initials, signer_email, signer_phone, intake_data,
        intake_data_hash, consent_given_at, submitted_at, ip_address, user_agent, client_id, guardian_user_id,
        combined_pdf_path, combined_pdf_hash, retention_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        intakeLinkId,
        status,
        signerName,
        signerInitials,
        signerEmail,
        signerPhone,
        intakeData ? JSON.stringify(intakeData) : null,
        intakeDataHash,
        consentGivenAt,
        submittedAt,
        ipAddress,
        userAgent,
        clientId,
        guardianUserId,
        combinedPdfPath,
        combinedPdfHash,
        retentionExpiresAt
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM intake_submissions WHERE id = ? LIMIT 1',
      [id]
    );
    return rows[0] || null;
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
    await pool.execute(`UPDATE intake_submissions SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }

  static async listByLinkId(intakeLinkId) {
    const [rows] = await pool.execute(
      `SELECT * FROM intake_submissions
       WHERE intake_link_id = ?
       ORDER BY created_at DESC, id DESC`,
      [intakeLinkId]
    );
    return rows;
  }

  static async listExpired({ limit = 200 } = {}) {
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
    const [rows] = await pool.query(
      `SELECT * FROM intake_submissions
       WHERE retention_expires_at IS NOT NULL
         AND retention_expires_at <= NOW()
       ORDER BY retention_expires_at ASC, id ASC
       LIMIT ${safeLimit}`
    );
    return rows;
  }

  static async deleteById(id) {
    if (!id) return 0;
    const [result] = await pool.execute(
      'DELETE FROM intake_submissions WHERE id = ?',
      [id]
    );
    return Number(result?.affectedRows || 0);
  }
}

export default IntakeSubmission;
