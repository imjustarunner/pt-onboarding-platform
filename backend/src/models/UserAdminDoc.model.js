import pool from '../config/database.js';

class UserAdminDoc {
  static async create(doc) {
    const {
      userId,
      title,
      docType,
      noteText,
      storagePath,
      originalName,
      mimeType,
      createdByUserId
    } = doc;

    const [result] = await pool.execute(
      `INSERT INTO user_admin_docs (
        user_id, title, doc_type, note_text,
        storage_path, original_name, mime_type,
        created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        title,
        docType || null,
        noteText || null,
        storagePath || null,
        originalName || null,
        mimeType || null,
        createdByUserId
      ]
    );

    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT d.*,
              cb.first_name AS created_by_first_name,
              cb.last_name AS created_by_last_name,
              cb.email AS created_by_email
       FROM user_admin_docs d
       LEFT JOIN users cb ON cb.id = d.created_by_user_id
       WHERE d.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  static async findByUser(userId) {
    const [rows] = await pool.execute(
      `SELECT d.*,
              cb.first_name AS created_by_first_name,
              cb.last_name AS created_by_last_name,
              cb.email AS created_by_email
       FROM user_admin_docs d
       LEFT JOIN users cb ON cb.id = d.created_by_user_id
       WHERE d.user_id = ?
       ORDER BY d.created_at DESC`,
      [userId]
    );
    return rows;
  }
}

export default UserAdminDoc;

