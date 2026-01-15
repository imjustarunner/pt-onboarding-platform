import pool from '../config/database.js';

class UserComplianceDocument {
  static async create(data) {
    const {
      userId,
      agencyId = null,
      documentType,
      expirationDate = null,
      isBlocking = false,
      filePath = null,
      notes = null,
      uploadedAt = new Date(),
      createdByUserId = null
    } = data;

    const [result] = await pool.execute(
      `INSERT INTO user_compliance_documents
       (user_id, agency_id, document_type, expiration_date, is_blocking, file_path, notes, uploaded_at, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        agencyId,
        documentType,
        expirationDate,
        !!isBlocking,
        filePath,
        notes,
        uploadedAt,
        createdByUserId
      ]
    );

    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM user_compliance_documents WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async findByUser(userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM user_compliance_documents WHERE user_id = ? ORDER BY uploaded_at DESC, created_at DESC',
      [userId]
    );
    return rows;
  }

  static async update(id, data) {
    const updates = [];
    const values = [];

    if (data.agencyId !== undefined) {
      updates.push('agency_id = ?');
      values.push(data.agencyId);
    }
    if (data.documentType !== undefined) {
      updates.push('document_type = ?');
      values.push(data.documentType);
    }
    if (data.expirationDate !== undefined) {
      updates.push('expiration_date = ?');
      values.push(data.expirationDate);
    }
    if (data.isBlocking !== undefined) {
      updates.push('is_blocking = ?');
      values.push(!!data.isBlocking);
    }
    if (data.filePath !== undefined) {
      updates.push('file_path = ?');
      values.push(data.filePath);
    }
    if (data.notes !== undefined) {
      updates.push('notes = ?');
      values.push(data.notes);
    }
    if (data.uploadedAt !== undefined) {
      updates.push('uploaded_at = ?');
      values.push(data.uploadedAt);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    await pool.execute(`UPDATE user_compliance_documents SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute('DELETE FROM user_compliance_documents WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  static async findExpiredBlockingByUser(userId, now = new Date()) {
    const [rows] = await pool.execute(
      `SELECT * FROM user_compliance_documents
       WHERE user_id = ?
         AND is_blocking = TRUE
         AND expiration_date IS NOT NULL
         AND expiration_date < DATE(?)`,
      [userId, now]
    );
    return rows;
  }

  static async findExpiringWithinDays(days) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM user_compliance_documents
       WHERE expiration_date IS NOT NULL
         AND expiration_date >= CURDATE()
         AND expiration_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)`,
      [parseInt(days)]
    );
    return rows;
  }

  static async findExpiredBlockingAll() {
    const [rows] = await pool.execute(
      `SELECT *
       FROM user_compliance_documents
       WHERE is_blocking = TRUE
         AND expiration_date IS NOT NULL
         AND expiration_date < CURDATE()`
    );
    return rows;
  }
}

export default UserComplianceDocument;

