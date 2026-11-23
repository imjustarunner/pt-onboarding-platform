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

  static async listOpen({ agencyIds = [], organizationId = null, uploadedByUserId = null, limit = 50, offset = 0, countOnly = false } = {}) {
    const conditions = ["d.status IN ('draft', 'failed', 'submitting')", 'd.created_client_id IS NULL'];
    const values = [];
    if (agencyIds !== null) {
      if (!agencyIds.length) return { drafts: [], total: 0 };
      conditions.push(`d.agency_id IN (${agencyIds.map(() => '?').join(',')})`);
      values.push(...agencyIds);
    }
    if (organizationId) { conditions.push('d.organization_id = ?'); values.push(organizationId); }
    if (uploadedByUserId) { conditions.push('d.uploaded_by_user_id = ?'); values.push(uploadedByUserId); }
    const where = conditions.join(' AND ');
    const [[{ total }]] = await pool.execute(`SELECT COUNT(*) total FROM referral_packet_upload_drafts d WHERE ${where}`, values);
    if (countOnly) return { drafts: [], total: Number(total) };
    const [drafts] = await pool.query(
      `SELECT d.id, d.organization_id, d.agency_id, d.uploaded_by_user_id, d.phi_document_id,
              d.submission_date, d.upload_note, d.first_name, d.last_name, d.initials, d.status,
              d.created_at, a.name organization_name, a.slug organization_slug,
              CONCAT_WS(' ', u.first_name, u.last_name) uploader_name,
              p.scan_status, p.removed_at, (p.id IS NOT NULL AND p.removed_at IS NULL) file_available
       FROM referral_packet_upload_drafts d
       JOIN agencies a ON a.id = d.organization_id
       LEFT JOIN users u ON u.id = d.uploaded_by_user_id
       LEFT JOIN client_phi_documents p ON p.id = d.phi_document_id
       WHERE ${where} ORDER BY d.created_at DESC, d.id DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );
    return { drafts, total: Number(total) };
  }
}

export default ReferralPacketDraft;
