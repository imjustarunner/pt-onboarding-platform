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
}

export default IntakeSubmissionDocument;
