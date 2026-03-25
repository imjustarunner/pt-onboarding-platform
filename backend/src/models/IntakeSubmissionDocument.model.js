import pool from '../config/database.js';

class IntakeSubmissionDocument {
  static async create(data) {
    const {
      intakeSubmissionId,
      clientId = null,
      documentTemplateId,
      signedPdfPath = null,
      pdfHash = null,
      signedAt = null,
      auditTrail = null
    } = data;

    const [result] = await pool.execute(
      `INSERT INTO intake_submission_documents
       (intake_submission_id, client_id, document_template_id, signed_pdf_path, pdf_hash, signed_at, audit_trail)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        intakeSubmissionId,
        clientId,
        documentTemplateId,
        signedPdfPath,
        pdfHash,
        signedAt,
        auditTrail ? JSON.stringify(auditTrail) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM intake_submission_documents WHERE id = ? LIMIT 1',
      [id]
    );
    return rows[0] || null;
  }

  static async listBySubmissionId(intakeSubmissionId) {
    const [rows] = await pool.execute(
      `SELECT * FROM intake_submission_documents
       WHERE intake_submission_id = ?
       ORDER BY id ASC`,
      [intakeSubmissionId]
    );
    return rows;
  }

  static async listUnassigned({ agencyId = null, limit = 100, offset = 0, excludeMedicalRecords = false } = {}) {
    let sql = `SELECT isd.*, dt.name AS document_template_name, il.title AS intake_link_title,
       il.requires_assignment, il.form_type AS intake_link_form_type, s.signer_name, s.signer_email, s.submitted_at, s.id AS intake_submission_id
       FROM intake_submission_documents isd
       JOIN document_templates dt ON dt.id = isd.document_template_id
       JOIN intake_submissions s ON s.id = isd.intake_submission_id
       JOIN intake_links il ON il.id = s.intake_link_id
       WHERE isd.client_id IS NULL
       AND isd.signed_pdf_path IS NOT NULL`;
    const values = [];
    if (agencyId) {
      // Include: direct agency links, school links (agency_schools), program links (organization_affiliations)
      sql += ` AND (
        (il.scope_type = 'agency' AND il.organization_id = ?)
        OR il.organization_id IN (SELECT school_organization_id FROM agency_schools WHERE agency_id = ? AND is_active = TRUE)
        OR il.organization_id IN (SELECT organization_id FROM organization_affiliations WHERE agency_id = ? AND is_active = TRUE)
      )`;
      values.push(agencyId, agencyId, agencyId);
    }
    if (excludeMedicalRecords) {
      sql += ` AND (il.form_type IS NULL OR il.form_type != 'medical_records_request')`;
    }
    sql += ` ORDER BY isd.signed_at DESC, isd.id DESC LIMIT ? OFFSET ?`;
    values.push(limit, offset);
    const [rows] = await pool.execute(sql, values);
    return rows;
  }

  static async updateClientId(id, clientId) {
    if (!id) return null;
    await pool.execute(
      'UPDATE intake_submission_documents SET client_id = ? WHERE id = ?',
      [clientId, id]
    );
    return this.findById(id);
  }

  /**
   * Signed intake PDFs for a client where the submission is tied to this guardian.
   */
  static async listSignedForGuardianClient({ guardianUserId, clientId }) {
    const gid = Number(guardianUserId);
    const cid = Number(clientId);
    if (!gid || !cid) return [];
    const [chk] = await pool.execute(
      `SELECT 1 FROM client_guardians
       WHERE guardian_user_id = ? AND client_id = ? AND access_enabled = 1
       LIMIT 1`,
      [gid, cid]
    );
    if (!chk?.length) return [];

    const [rows] = await pool.execute(
      `SELECT isd.id,
              isd.intake_submission_id,
              isd.client_id,
              isd.document_template_id,
              isd.signed_pdf_path,
              isd.pdf_hash,
              isd.signed_at,
              dt.name AS document_template_name,
              il.title AS intake_link_title
       FROM intake_submission_documents isd
       JOIN document_templates dt ON dt.id = isd.document_template_id
       JOIN intake_submissions s ON s.id = isd.intake_submission_id
       JOIN intake_links il ON il.id = s.intake_link_id
       WHERE isd.client_id = ?
         AND isd.signed_pdf_path IS NOT NULL
         AND s.guardian_user_id = ?
       ORDER BY isd.signed_at DESC, isd.id DESC`,
      [cid, gid]
    );
    return rows || [];
  }
}

export default IntakeSubmissionDocument;
