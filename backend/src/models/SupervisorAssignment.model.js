import pool from '../config/database.js';

class SupervisorAssignment {
  /**
   * Create a new supervisor assignment
   */
  static async create(supervisorId, superviseeId, agencyId, createdByUserId = null, { isPrimary = false } = {}) {
    const [result] = await pool.execute(
      `INSERT INTO supervisor_assignments (supervisor_id, supervisee_id, agency_id, is_primary, created_by_user_id)
       VALUES (?, ?, ?, ?, ?)`,
      [supervisorId, superviseeId, agencyId, isPrimary ? 1 : 0, createdByUserId]
    );

    return this.findById(result.insertId);
  }

  /**
   * Clear primary flag for a supervisee within an agency
   */
  static async clearPrimary(superviseeId, agencyId) {
    await pool.execute(
      `UPDATE supervisor_assignments
       SET is_primary = 0
       WHERE supervisee_id = ? AND agency_id = ?`,
      [superviseeId, agencyId]
    );
    return true;
  }

  /**
   * Set primary supervisor for a supervisee within an agency
   */
  static async setPrimary(supervisorId, superviseeId, agencyId) {
    await pool.execute(
      `UPDATE supervisor_assignments
       SET is_primary = CASE WHEN supervisor_id = ? THEN 1 ELSE 0 END
       WHERE supervisee_id = ? AND agency_id = ?`,
      [supervisorId, superviseeId, agencyId]
    );
    return true;
  }

  /**
   * Find assignment by ID
   */
  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT sa.*,
              s.first_name as supervisor_first_name,
              s.last_name as supervisor_last_name,
              s.email as supervisor_email,
              e.first_name as supervisee_first_name,
              e.last_name as supervisee_last_name,
              e.email as supervisee_email,
              a.name as agency_name
       FROM supervisor_assignments sa
       LEFT JOIN users s ON sa.supervisor_id = s.id
       LEFT JOIN users e ON sa.supervisee_id = e.id
       LEFT JOIN agencies a ON sa.agency_id = a.id
       WHERE sa.id = ?`,
      [id]
    );

    return rows[0] || null;
  }

  /**
   * Find all supervisees for a supervisor in an agency
   */
  static async findBySupervisor(supervisorId, agencyId = null) {
    let query = `
      SELECT sa.*,
             u.id as supervisee_id,
             u.first_name as supervisee_first_name,
             u.last_name as supervisee_last_name,
             u.email as supervisee_email,
             u.role as supervisee_role,
             u.profile_photo_path as supervisee_profile_photo_path,
             a.name as agency_name,
             TRIM(COALESCE(a.slug, a.portal_url, '')) as agency_slug
      FROM supervisor_assignments sa
      INNER JOIN users u ON sa.supervisee_id = u.id
      INNER JOIN agencies a ON sa.agency_id = a.id
      WHERE sa.supervisor_id = ?
    `;
    const params = [supervisorId];

    if (agencyId) {
      query += ' AND sa.agency_id = ?';
      params.push(agencyId);
    }

    query += ' ORDER BY u.last_name, u.first_name';

    const [rows] = await pool.execute(query, params);
    return rows;
  }

  /**
   * Find all supervisors for a supervisee in an agency
   */
  static async findBySupervisee(superviseeId, agencyId = null) {
    let query = `
      SELECT sa.*,
             u.id as supervisor_id,
             u.first_name as supervisor_first_name,
             u.last_name as supervisor_last_name,
             u.email as supervisor_email,
             u.role as supervisor_role,
             a.name as agency_name
      FROM supervisor_assignments sa
      INNER JOIN users u ON sa.supervisor_id = u.id
      INNER JOIN agencies a ON sa.agency_id = a.id
      WHERE sa.supervisee_id = ?
    `;
    const params = [superviseeId];

    if (agencyId) {
      query += ' AND sa.agency_id = ?';
      params.push(agencyId);
    }

    query += ' ORDER BY u.last_name, u.first_name';

    const [rows] = await pool.execute(query, params);
    return rows;
  }

  /**
   * Find all assignments in an agency
   */
  static async findByAgency(agencyId) {
    const [rows] = await pool.execute(
      `SELECT sa.*,
              s.first_name as supervisor_first_name,
              s.last_name as supervisor_last_name,
              s.email as supervisor_email,
              e.first_name as supervisee_first_name,
              e.last_name as supervisee_last_name,
              e.email as supervisee_email
       FROM supervisor_assignments sa
       LEFT JOIN users s ON sa.supervisor_id = s.id
       LEFT JOIN users e ON sa.supervisee_id = e.id
       WHERE sa.agency_id = ?
       ORDER BY s.last_name, s.first_name, e.last_name, e.first_name`,
      [agencyId]
    );

    return rows;
  }

  /**
   * Delete an assignment
   */
  static async delete(supervisorId, superviseeId, agencyId) {
    const [result] = await pool.execute(
      `DELETE FROM supervisor_assignments
       WHERE supervisor_id = ? AND supervisee_id = ? AND agency_id = ?`,
      [supervisorId, superviseeId, agencyId]
    );

    return result.affectedRows > 0;
  }

  /**
   * Delete assignment by ID
   */
  static async deleteById(id) {
    const [result] = await pool.execute(
      'DELETE FROM supervisor_assignments WHERE id = ?',
      [id]
    );

    return result.affectedRows > 0;
  }

  /**
   * Delete all assignments for a supervisor (optionally scoped to agency).
   */
  static async deleteAllForSupervisor(supervisorId, agencyId = null) {
    if (!supervisorId) return false;
    if (agencyId) {
      const [result] = await pool.execute(
        'DELETE FROM supervisor_assignments WHERE supervisor_id = ? AND agency_id = ?',
        [supervisorId, agencyId]
      );
      return result.affectedRows > 0;
    }
    const [result] = await pool.execute(
      'DELETE FROM supervisor_assignments WHERE supervisor_id = ?',
      [supervisorId]
    );
    return result.affectedRows > 0;
  }

  /**
   * Check if assignment exists
   */
  static async isAssigned(supervisorId, superviseeId, agencyId) {
    const [rows] = await pool.execute(
      `SELECT id FROM supervisor_assignments
       WHERE supervisor_id = ? AND supervisee_id = ? AND agency_id = ?`,
      [supervisorId, superviseeId, agencyId]
    );

    return rows.length > 0;
  }

  /**
   * Get array of supervisee IDs for a supervisor
   */
  static async getSuperviseeIds(supervisorId, agencyId = null) {
    const assignments = await this.findBySupervisor(supervisorId, agencyId);
    return assignments.map(a => a.supervisee_id);
  }

  /**
   * Get array of supervisor IDs for a supervisee
   */
  static async getSupervisorIds(superviseeId, agencyId = null) {
    const assignments = await this.findBySupervisee(superviseeId, agencyId);
    return assignments.map(a => a.supervisor_id);
  }

  /**
   * Check if a supervisor has access to a user (is assigned to them)
   */
  static async supervisorHasAccess(supervisorId, superviseeId, agencyId) {
    return await this.isAssigned(supervisorId, superviseeId, agencyId);
  }

  /**
   * Get all supervisee IDs for multiple supervisors in an agency
   */
  static async getSuperviseeIdsForSupervisors(supervisorIds, agencyId) {
    if (!supervisorIds || supervisorIds.length === 0) {
      return [];
    }

    const placeholders = supervisorIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT DISTINCT supervisee_id
       FROM supervisor_assignments
       WHERE supervisor_id IN (${placeholders}) AND agency_id = ?`,
      [...supervisorIds, agencyId]
    );

    return rows.map(r => r.supervisee_id);
  }
}

export default SupervisorAssignment;
