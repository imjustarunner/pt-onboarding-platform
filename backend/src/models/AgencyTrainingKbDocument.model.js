import pool from '../config/database.js';

class AgencyTrainingKbDocument {
  static async findByAgencyId(agencyId, { folder = null } = {}) {
    const params = [agencyId];
    let sql = `
      SELECT d.*, u.first_name AS uploaded_by_first_name, u.last_name AS uploaded_by_last_name
      FROM agency_training_kb_documents d
      LEFT JOIN users u ON u.id = d.uploaded_by_user_id
      WHERE d.agency_id = ?
    `;
    if (folder) {
      sql += ' AND d.folder = ?';
      params.push(folder);
    }
    sql += ' ORDER BY d.folder ASC, d.created_at DESC';
    const [rows] = await pool.execute(sql, params);
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM agency_training_kb_documents WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async create({ agencyId, folder, fileName, gcsPath, contentType, sizeBytes, uploadedByUserId }) {
    const [result] = await pool.execute(
      `INSERT INTO agency_training_kb_documents
        (agency_id, folder, file_name, gcs_path, content_type, size_bytes, uploaded_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [agencyId, folder, fileName, gcsPath, contentType || null, sizeBytes || null, uploadedByUserId || null]
    );
    return this.findById(result.insertId);
  }

  static async deleteById(id) {
    const [result] = await pool.execute(
      'DELETE FROM agency_training_kb_documents WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }
}

export default AgencyTrainingKbDocument;
