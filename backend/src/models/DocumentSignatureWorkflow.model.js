import pool from '../config/database.js';

class DocumentSignatureWorkflow {
  static async create(signedDocumentId) {
    try {
      console.log(`DocumentSignatureWorkflow.create: Creating workflow for signed document ${signedDocumentId}`);
      const [result] = await pool.execute(
        'INSERT INTO document_signature_workflow (signed_document_id) VALUES (?)',
        [signedDocumentId]
      );
      console.log(`DocumentSignatureWorkflow.create: Workflow created with ID ${result.insertId}`);
      return this.findById(result.insertId);
    } catch (error) {
      console.error('DocumentSignatureWorkflow.create: Error:', error);
      console.error('DocumentSignatureWorkflow.create: Error details:', {
        message: error.message,
        code: error.code,
        sqlMessage: error.sqlMessage,
        sqlState: error.sqlState,
        signedDocumentId
      });
      throw error;
    }
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM document_signature_workflow WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async findBySignedDocument(signedDocumentId) {
    const [rows] = await pool.execute(
      'SELECT * FROM document_signature_workflow WHERE signed_document_id = ?',
      [signedDocumentId]
    );
    return rows[0] || null;
  }

  static async recordConsent(signedDocumentId, ipAddress, userAgent) {
    await pool.execute(
      `UPDATE document_signature_workflow 
       SET consent_given_at = CURRENT_TIMESTAMP, 
           consent_ip = ?, 
           consent_user_agent = ?
       WHERE signed_document_id = ?`,
      [ipAddress, userAgent, signedDocumentId]
    );
    return this.findBySignedDocument(signedDocumentId);
  }

  static async recordIntent(signedDocumentId, ipAddress, userAgent) {
    await pool.execute(
      `UPDATE document_signature_workflow 
       SET intent_to_sign_at = CURRENT_TIMESTAMP, 
           intent_ip = ?, 
           intent_user_agent = ?
       WHERE signed_document_id = ?`,
      [ipAddress, userAgent, signedDocumentId]
    );
    return this.findBySignedDocument(signedDocumentId);
  }

  static async recordIdentityVerification(signedDocumentId) {
    await pool.execute(
      `UPDATE document_signature_workflow 
       SET identity_verified_at = CURRENT_TIMESTAMP
       WHERE signed_document_id = ?`,
      [signedDocumentId]
    );
    return this.findBySignedDocument(signedDocumentId);
  }

  static async finalize(signedDocumentId) {
    await pool.execute(
      `UPDATE document_signature_workflow 
       SET finalized_at = CURRENT_TIMESTAMP
       WHERE signed_document_id = ?`,
      [signedDocumentId]
    );
    return this.findBySignedDocument(signedDocumentId);
  }

  static async getWorkflowState(signedDocumentId) {
    return this.findBySignedDocument(signedDocumentId);
  }
}

export default DocumentSignatureWorkflow;

