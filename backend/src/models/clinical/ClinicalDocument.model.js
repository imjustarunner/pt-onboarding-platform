import clinicalPool from '../../config/clinicalDatabase.js';

class ClinicalDocument {
  static async create({
    clinicalSessionId,
    agencyId,
    clientId,
    title,
    documentType = null,
    storagePath = null,
    originalName = null,
    mimeType = null,
    metadataJson = null,
    createdByUserId
  }) {
    const [result] = await clinicalPool.execute(
      `INSERT INTO clinical_documents
       (clinical_session_id, agency_id, client_id, title, document_type, storage_path, original_name, mime_type, metadata_json, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clinicalSessionId,
        agencyId,
        clientId,
        title,
        documentType,
        storagePath,
        originalName,
        mimeType,
        metadataJson ? JSON.stringify(metadataJson) : null,
        createdByUserId
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const did = Number(id || 0);
    if (!did) return null;
    const [rows] = await clinicalPool.execute(
      `SELECT *
       FROM clinical_documents
       WHERE id = ?
       LIMIT 1`,
      [did]
    );
    return rows?.[0] || null;
  }

  static async listBySession({ clinicalSessionId, includeDeleted = false }) {
    const sid = Number(clinicalSessionId || 0);
    if (!sid) return [];
    const [rows] = await clinicalPool.execute(
      `SELECT id, clinical_session_id, agency_id, client_id, title, document_type, storage_path, original_name, mime_type,
              metadata_json, created_by_user_id, created_at, updated_at,
              is_deleted, deleted_at, deleted_by_user_id, is_legal_hold, legal_hold_reason, legal_hold_set_at,
              legal_hold_set_by_user_id, legal_hold_released_at, legal_hold_released_by_user_id
       FROM clinical_documents
       WHERE clinical_session_id = ?
         AND (? = 1 OR is_deleted = 0)
       ORDER BY created_at DESC`,
      [sid, includeDeleted ? 1 : 0]
    );
    return rows || [];
  }

  static async softDeleteById(id, actorUserId) {
    const [result] = await clinicalPool.execute(
      `UPDATE clinical_documents
       SET is_deleted = 1,
           deleted_at = NOW(),
           deleted_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND is_deleted = 0
         AND is_legal_hold = 0`,
      [actorUserId, id]
    );
    return result.affectedRows > 0;
  }

  static async restoreById(id) {
    const [result] = await clinicalPool.execute(
      `UPDATE clinical_documents
       SET is_deleted = 0,
           deleted_at = NULL,
           deleted_by_user_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND is_deleted = 1`,
      [id]
    );
    return result.affectedRows > 0;
  }

  static async setLegalHoldById(id, reason, actorUserId) {
    const [result] = await clinicalPool.execute(
      `UPDATE clinical_documents
       SET is_legal_hold = 1,
           legal_hold_reason = ?,
           legal_hold_set_at = NOW(),
           legal_hold_set_by_user_id = ?,
           legal_hold_released_at = NULL,
           legal_hold_released_by_user_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [reason, actorUserId, id]
    );
    return result.affectedRows > 0;
  }

  static async releaseLegalHoldById(id, actorUserId) {
    const [result] = await clinicalPool.execute(
      `UPDATE clinical_documents
       SET is_legal_hold = 0,
           legal_hold_released_at = NOW(),
           legal_hold_released_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND is_legal_hold = 1`,
      [actorUserId, id]
    );
    return result.affectedRows > 0;
  }
}

export default ClinicalDocument;

