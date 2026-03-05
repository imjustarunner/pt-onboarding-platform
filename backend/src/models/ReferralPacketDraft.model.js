import pool from '../config/database.js';

class ReferralPacketDraft {
  static async create(data) {
    const {
      organizationId,
      agencyId,
      uploadedByUserId = null,
      phiDocumentId = null,
      submissionDate = null,
      uploadNote = null,
      firstName = null,
      lastName = null,
      initials = null,
      status = 'draft',
      createdClientId = null,
      lastError = null,
      submittedAt = null
    } = data;

    const [result] = await pool.execute(
      `INSERT INTO referral_packet_upload_drafts
       (organization_id, agency_id, uploaded_by_user_id, phi_document_id, submission_date, upload_note, first_name, last_name, initials, status, created_client_id, last_error, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        organizationId,
        agencyId,
        uploadedByUserId,
        phiDocumentId,
        submissionDate,
        uploadNote,
        firstName,
        lastName,
        initials,
        status,
        createdClientId,
        lastError,
        submittedAt
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM referral_packet_upload_drafts WHERE id = ? LIMIT 1`,
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
    await pool.execute(`UPDATE referral_packet_upload_drafts SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }

  static async claimForSubmit(id) {
    if (!id) return false;
    const [result] = await pool.execute(
      `UPDATE referral_packet_upload_drafts
       SET status = 'submitting', last_error = NULL
       WHERE id = ? AND status IN ('draft', 'failed')`,
      [id]
    );
    return Number(result?.affectedRows || 0) > 0;
  }

  static async findLatestOpenDraft({ organizationId, uploadedByUserId }) {
    if (!organizationId || !uploadedByUserId) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM referral_packet_upload_drafts
       WHERE organization_id = ?
         AND uploaded_by_user_id = ?
         AND status IN ('draft', 'failed', 'submitting')
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
      [organizationId, uploadedByUserId]
    );
    return rows[0] || null;
  }
}

export default ReferralPacketDraft;
