import pool from '../config/database.js';

class PhiDocumentAuditLog {
  static async create({ documentId, clientId = null, action, actorUserId = null, actorLabel = null, ipAddress = null, metadata = null }) {
    const [result] = await pool.execute(
      `INSERT INTO phi_document_audit_logs
       (document_id, client_id, action, actor_user_id, actor_label, ip_address, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        documentId,
        clientId,
        action,
        actorUserId,
        actorLabel,
        ipAddress,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM phi_document_audit_logs WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  static async listByClientId(clientId) {
    const [rows] = await pool.execute(
      `SELECT * FROM phi_document_audit_logs
       WHERE client_id = ?
       ORDER BY created_at DESC, id DESC`,
      [clientId]
    );
    return rows;
  }

  static async listByDocumentId(documentId) {
    const [rows] = await pool.execute(
      `SELECT * FROM phi_document_audit_logs
       WHERE document_id = ?
       ORDER BY created_at DESC, id DESC`,
      [documentId]
    );
    return rows;
  }
}

export default PhiDocumentAuditLog;
