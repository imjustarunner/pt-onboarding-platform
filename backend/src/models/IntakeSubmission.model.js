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
      consentGivenAt = null,
      submittedAt = null,
      ipAddress = null,
      userAgent = null,
      clientId = null,
      guardianUserId = null,
      combinedPdfPath = null,
      combinedPdfHash = null
    } = data;

    const [result] = await pool.execute(
      `INSERT INTO intake_submissions
       (intake_link_id, status, signer_name, signer_initials, signer_email, signer_phone, intake_data,
        consent_given_at, submitted_at, ip_address, user_agent, client_id, guardian_user_id,
        combined_pdf_path, combined_pdf_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        intakeLinkId,
        status,
        signerName,
        signerInitials,
        signerEmail,
        signerPhone,
        intakeData ? JSON.stringify(intakeData) : null,
        consentGivenAt,
        submittedAt,
        ipAddress,
        userAgent,
        clientId,
        guardianUserId,
        combinedPdfPath,
        combinedPdfHash
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
}

export default IntakeSubmission;
