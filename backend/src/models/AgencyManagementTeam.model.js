import pool from '../config/database.js';

export default class AgencyManagementTeam {
  /**
   * List management team members for an agency (for agency view - with presence).
   * Returns users with presence status, ordered by display_order.
   */
  static async listForAgencyWithPresence(agencyId) {
    const id = parseInt(agencyId, 10);
    if (!id) return [];

    let profilePhotoField = '';
    let preferredNameField = '';
    try {
      const dbName = process.env.DB_NAME || 'onboarding_stage';
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('profile_photo_path', 'preferred_name')",
        [dbName]
      );
      const names = (cols || []).map((c) => c.COLUMN_NAME);
      if (names.includes('profile_photo_path')) profilePhotoField = ', u.profile_photo_path';
      if (names.includes('preferred_name')) preferredNameField = ', u.preferred_name';
    } catch {
      /* best-effort */
    }

    const [rows] = await pool.execute(
      `SELECT u.id,
              u.first_name,
              u.last_name,
              u.email,
              u.role${profilePhotoField}${preferredNameField},
              amt.display_role,
              amt.display_order,
              ps.status AS presence_status,
              ps.note AS presence_note,
              ps.expected_return_at AS presence_expected_return_at
       FROM agency_management_team amt
       INNER JOIN users u ON u.id = amt.user_id
       LEFT JOIN user_presence_status ps ON ps.user_id = u.id
       WHERE amt.agency_id = ?
         AND amt.is_active = TRUE
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)
       ORDER BY amt.display_order ASC, u.first_name ASC, u.last_name ASC`,
      [id]
    );
    return rows || [];
  }

  /**
   * List management team config (for SuperAdmin - raw rows for editing).
   */
  static async listConfig(agencyId) {
    const id = parseInt(agencyId, 10);
    if (!id) return [];

    const [rows] = await pool.execute(
      `SELECT amt.id, amt.user_id, amt.display_role, amt.display_order,
              u.first_name, u.last_name, u.email, u.role
       FROM agency_management_team amt
       INNER JOIN users u ON u.id = amt.user_id
       WHERE amt.agency_id = ? AND amt.is_active = TRUE
       ORDER BY amt.display_order ASC, u.first_name ASC`,
      [id]
    );
    return rows || [];
  }

  /**
   * Update management team config. Replaces all members.
   * members: [{ userId, displayRole?, displayOrder? }, ...]
   */
  static async setConfig(agencyId, members) {
    const id = parseInt(agencyId, 10);
    if (!id) return [];

    await pool.execute('DELETE FROM agency_management_team WHERE agency_id = ?', [id]);

    const list = Array.isArray(members) ? members : [];
    if (list.length === 0) return [];

    const STAFF_ROLES = ['staff', 'admin', 'super_admin'];
    let order = 0;
    for (const m of list) {
      const userId = parseInt(m.userId ?? m.user_id, 10);
      if (!userId) continue;
      const displayRole = (m.displayRole ?? m.display_role ?? '').trim().slice(0, 80) || null;
      const displayOrder = parseInt(m.displayOrder ?? m.display_order ?? order, 10);
      const finalOrder = !isNaN(displayOrder) ? displayOrder : order;

      // Only allow staff/admin/super_admin
      const [userRows] = await pool.execute(
        'SELECT id, role FROM users WHERE id = ? AND role IN (?, ?, ?) LIMIT 1',
        [userId, ...STAFF_ROLES]
      );
      if (!userRows || userRows.length === 0) continue;

      await pool.execute(
        `INSERT INTO agency_management_team (agency_id, user_id, display_role, display_order)
         VALUES (?, ?, ?, ?)`,
        [id, userId, displayRole, finalOrder]
      );
      order++;
    }
    return this.listConfig(id);
  }

  /**
   * List eligible users for management team (staff, admin, super_admin).
   */
  static async listEligibleUsers() {
    const [rows] = await pool.execute(
      `SELECT id, first_name, last_name, email, role
       FROM users
       WHERE role IN ('staff', 'admin', 'super_admin')
         AND (is_archived = FALSE OR is_archived IS NULL)
       ORDER BY role ASC, first_name ASC, last_name ASC`
    );
    return rows || [];
  }
}
