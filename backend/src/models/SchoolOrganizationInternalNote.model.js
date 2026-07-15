import pool from '../config/database.js';

class SchoolOrganizationInternalNote {
  static async create({ schoolOrganizationId, authorUserId, message }) {
    const [result] = await pool.execute(
      `INSERT INTO school_organization_internal_notes
         (school_organization_id, author_user_id, message)
       VALUES (?, ?, ?)`,
      [schoolOrganizationId, authorUserId, String(message || '').trim()]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT n.*,
              u.first_name AS author_first_name,
              u.last_name AS author_last_name,
              u.email AS author_email
       FROM school_organization_internal_notes n
       LEFT JOIN users u ON u.id = n.author_user_id
       WHERE n.id = ?
       LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  static async listBySchoolOrganizationId(schoolOrganizationId, { limit = 200 } = {}) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
    const [rows] = await pool.execute(
      `SELECT n.*,
              u.first_name AS author_first_name,
              u.last_name AS author_last_name,
              u.email AS author_email
       FROM school_organization_internal_notes n
       LEFT JOIN users u ON u.id = n.author_user_id
       WHERE n.school_organization_id = ?
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT ${safeLimit}`,
      [schoolOrganizationId]
    );
    return rows || [];
  }
}

export default SchoolOrganizationInternalNote;
