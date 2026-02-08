import pool from '../config/database.js';

class ClientPhiDocument {
  static async create(data) {
    const {
      clientId,
      agencyId,
      schoolOrganizationId,
      intakeSubmissionId = null,
      storagePath,
      originalName = null,
      documentTitle = null,
      documentType = null,
      mimeType = null,
      uploadedByUserId = null,
      scanStatus = null,
      scanResult = null,
      scannedAt = null,
      quarantinePath = null,
      isEncrypted = false,
      encryptionKeyId = null,
      encryptionWrappedKey = null,
      encryptionIv = null,
      encryptionAuthTag = null,
      encryptionAlg = null,
      exportedToEhrAt = null,
      exportedToEhrByUserId = null,
      removedAt = null,
      removedByUserId = null,
      removedReason = null,
      expiresAt = null
    } = data;

    const [result] = await pool.execute(
      `INSERT INTO client_phi_documents
       (client_id, agency_id, school_organization_id, intake_submission_id, storage_path, original_name, document_title, document_type, mime_type, uploaded_by_user_id,
        scan_status, scan_result, scanned_at, quarantine_path,
        is_encrypted, encryption_key_id, encryption_wrapped_key, encryption_iv, encryption_auth_tag, encryption_alg,
        exported_to_ehr_at, exported_to_ehr_by_user_id, removed_at, removed_by_user_id, removed_reason, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clientId,
        agencyId,
        schoolOrganizationId,
        intakeSubmissionId,
        storagePath,
        originalName,
        documentTitle,
        documentType,
        mimeType,
        uploadedByUserId,
        scanStatus,
        scanResult,
        scannedAt,
        quarantinePath,
        isEncrypted ? 1 : 0,
        encryptionKeyId,
        encryptionWrappedKey,
        encryptionIv,
        encryptionAuthTag,
        encryptionAlg,
        exportedToEhrAt,
        exportedToEhrByUserId,
        removedAt,
        removedByUserId,
        removedReason,
        expiresAt
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM client_phi_documents WHERE id = ? LIMIT 1', [id]);
    return rows[0] || null;
  }

  static async findByClientId(clientId) {
    const [rows] = await pool.execute(
      `SELECT * FROM client_phi_documents
       WHERE client_id = ?
       ORDER BY uploaded_at DESC, id DESC`,
      [clientId]
    );
    return rows;
  }

  static async listByIntakeSubmissionId(intakeSubmissionId) {
    const [rows] = await pool.execute(
      `SELECT * FROM client_phi_documents
       WHERE intake_submission_id = ?
       ORDER BY id ASC`,
      [intakeSubmissionId]
    );
    return rows;
  }

  static async deleteByIds(ids = []) {
    const list = Array.isArray(ids) ? ids.filter((id) => Number(id)) : [];
    if (!list.length) return 0;
    const placeholders = list.map(() => '?').join(', ');
    const [result] = await pool.execute(
      `DELETE FROM client_phi_documents WHERE id IN (${placeholders})`,
      list
    );
    return Number(result?.affectedRows || 0);
  }

  static async findByStoragePath(storagePath) {
    const [rows] = await pool.execute(
      `SELECT * FROM client_phi_documents WHERE storage_path = ? LIMIT 1`,
      [storagePath]
    );
    return rows[0] || null;
  }

  static async updateScanStatusById({ id, scanStatus, scanResult = null, scannedAt = null, storagePath = null }) {
    if (!id) return null;
    const updates = [];
    const values = [];
    if (scanStatus !== undefined) {
      updates.push('scan_status = ?');
      values.push(scanStatus);
    }
    if (scanResult !== undefined) {
      updates.push('scan_result = ?');
      values.push(scanResult);
    }
    if (scannedAt !== undefined) {
      updates.push('scanned_at = ?');
      values.push(scannedAt);
    }
    if (storagePath !== undefined) {
      updates.push('storage_path = ?');
      values.push(storagePath);
    }
    if (!updates.length) return this.findById(id);
    values.push(id);
    await pool.execute(`UPDATE client_phi_documents SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }

  static async updateLifecycleById({ id, exportedToEhrAt, exportedToEhrByUserId, removedAt, removedByUserId, removedReason, expiresAt }) {
    if (!id) return null;
    const updates = [];
    const values = [];
    if (exportedToEhrAt !== undefined) {
      updates.push('exported_to_ehr_at = ?');
      values.push(exportedToEhrAt);
    }
    if (exportedToEhrByUserId !== undefined) {
      updates.push('exported_to_ehr_by_user_id = ?');
      values.push(exportedToEhrByUserId);
    }
    if (removedAt !== undefined) {
      updates.push('removed_at = ?');
      values.push(removedAt);
    }
    if (removedByUserId !== undefined) {
      updates.push('removed_by_user_id = ?');
      values.push(removedByUserId);
    }
    if (removedReason !== undefined) {
      updates.push('removed_reason = ?');
      values.push(removedReason);
    }
    if (expiresAt !== undefined) {
      updates.push('expires_at = ?');
      values.push(expiresAt);
    }
    if (!updates.length) return this.findById(id);
    values.push(id);
    await pool.execute(`UPDATE client_phi_documents SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }
}

export default ClientPhiDocument;

