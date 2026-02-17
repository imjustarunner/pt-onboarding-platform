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
              cb.email AS created_by_email,
              db.first_name AS deleted_by_first_name,
              db.last_name AS deleted_by_last_name,
              db.email AS deleted_by_email,
              hb.first_name AS legal_hold_set_by_first_name,
              hb.last_name AS legal_hold_set_by_last_name,
              hb.email AS legal_hold_set_by_email,
              hr.first_name AS legal_hold_released_by_first_name,
              hr.last_name AS legal_hold_released_by_last_name,
              hr.email AS legal_hold_released_by_email
       FROM user_admin_docs d
       LEFT JOIN users cb ON cb.id = d.created_by_user_id
       LEFT JOIN users db ON db.id = d.deleted_by_user_id
       LEFT JOIN users hb ON hb.id = d.legal_hold_set_by_user_id
       LEFT JOIN users hr ON hr.id = d.legal_hold_released_by_user_id
       WHERE d.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  static async findByUser(userId, { includeDeleted = false } = {}) {
    const [rows] = await pool.execute(
      `SELECT d.*,
              cb.first_name AS created_by_first_name,
              cb.last_name AS created_by_last_name,
              cb.email AS created_by_email,
              db.first_name AS deleted_by_first_name,
              db.last_name AS deleted_by_last_name,
              db.email AS deleted_by_email,
              hb.first_name AS legal_hold_set_by_first_name,
              hb.last_name AS legal_hold_set_by_last_name,
              hb.email AS legal_hold_set_by_email,
              hr.first_name AS legal_hold_released_by_first_name,
              hr.last_name AS legal_hold_released_by_last_name,
              hr.email AS legal_hold_released_by_email
       FROM user_admin_docs d
       LEFT JOIN users cb ON cb.id = d.created_by_user_id
       LEFT JOIN users db ON db.id = d.deleted_by_user_id
       LEFT JOIN users hb ON hb.id = d.legal_hold_set_by_user_id
       LEFT JOIN users hr ON hr.id = d.legal_hold_released_by_user_id
       WHERE d.user_id = ?
         AND (? = 1 OR d.is_deleted = 0)
       ORDER BY d.created_at DESC`,
      [userId, includeDeleted ? 1 : 0]
    );
    return rows;
  }

  static async deleteById(id) {
    const [result] = await pool.execute(
      'DELETE FROM user_admin_docs WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  static async softDeleteById(id, deletedByUserId) {
    const [result] = await pool.execute(
      `UPDATE user_admin_docs
       SET is_deleted = 1,
           deleted_at = NOW(),
           deleted_by_user_id = ?,
           updated_at = NOW()
       WHERE id = ?
         AND is_deleted = 0`,
      [deletedByUserId, id]
    );
    return result.affectedRows > 0;
  }

  static async restoreById(id) {
    const [result] = await pool.execute(
      `UPDATE user_admin_docs
       SET is_deleted = 0,
           deleted_at = NULL,
           deleted_by_user_id = NULL,
           updated_at = NOW()
       WHERE id = ?
         AND is_deleted = 1`,
      [id]
    );
    return result.affectedRows > 0;
  }

  static async setLegalHoldById(id, { reason = null, actorUserId }) {
    const [result] = await pool.execute(
      `UPDATE user_admin_docs
       SET is_legal_hold = 1,
           legal_hold_reason = ?,
           legal_hold_set_at = NOW(),
           legal_hold_set_by_user_id = ?,
           legal_hold_released_at = NULL,
           legal_hold_released_by_user_id = NULL,
           updated_at = NOW()
       WHERE id = ?`,
      [reason, actorUserId, id]
    );
    return result.affectedRows > 0;
  }

  static async releaseLegalHoldById(id, actorUserId) {
    const [result] = await pool.execute(
      `UPDATE user_admin_docs
       SET is_legal_hold = 0,
           legal_hold_released_at = NOW(),
           legal_hold_released_by_user_id = ?,
           updated_at = NOW()
       WHERE id = ?
         AND is_legal_hold = 1`,
      [actorUserId, id]
    );
    return result.affectedRows > 0;
  }
}

export default UserAdminDoc;

