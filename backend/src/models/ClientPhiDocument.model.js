import pool from '../config/database.js';

class ClientPhiDocument {
  static async create(data) {
    const {
      clientId,
      agencyId,
      schoolOrganizationId,
      storagePath,
      originalName = null,
      mimeType = null,
      uploadedByUserId = null
    } = data;

    const [result] = await pool.execute(
      `INSERT INTO client_phi_documents
       (client_id, agency_id, school_organization_id, storage_path, original_name, mime_type, uploaded_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [clientId, agencyId, schoolOrganizationId, storagePath, originalName, mimeType, uploadedByUserId]
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

  static async findByStoragePath(storagePath) {
    const [rows] = await pool.execute(
      `SELECT * FROM client_phi_documents WHERE storage_path = ? LIMIT 1`,
      [storagePath]
    );
    return rows[0] || null;
  }
}

export default ClientPhiDocument;

