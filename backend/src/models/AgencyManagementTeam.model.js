import pool from '../config/database.js';

export const ROLE_TYPES = [
  { code: 'credentialing', label: 'Credentialing' },
  { code: 'billing', label: 'Billing' },
  { code: 'support', label: 'Support' },
  { code: 'account_manager', label: 'Account Manager' }
];

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
              amt.role_type,
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
      `SELECT amt.id, amt.user_id, amt.display_role, amt.role_type, amt.display_order,
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
      const roleType = (m.roleType ?? m.role_type ?? '').trim().slice(0, 40) || null;
      const displayOrder = parseInt(m.displayOrder ?? m.display_order ?? order, 10);
      const finalOrder = !isNaN(displayOrder) ? displayOrder : order;

      // Only allow staff/admin/super_admin
      const [userRows] = await pool.execute(
        'SELECT id, role FROM users WHERE id = ? AND role IN (?, ?, ?) LIMIT 1',
        [userId, ...STAFF_ROLES]
      );
      if (!userRows || userRows.length === 0) continue;

      await pool.execute(
        `INSERT INTO agency_management_team (agency_id, user_id, display_role, role_type, display_order)
         VALUES (?, ?, ?, ?, ?)`,
        [id, userId, displayRole, roleType, finalOrder]
      );
      order++;
    }
    return this.listConfig(id);
  }

  /**
   * Get coverage for (agency, date). Returns map: role_type -> { covered_by_user_id, replaces_user_id }.
   */
  static async getCoverageForDate(agencyId, dateStr) {
    const id = parseInt(agencyId, 10);
    if (!id || !dateStr) return {};
    const [rows] = await pool.execute(
      `SELECT role_type, covered_by_user_id, replaces_user_id
       FROM agency_team_coverage
       WHERE agency_id = ? AND coverage_date = ?`,
      [id, dateStr]
    );
    const out = {};
    for (const r of rows || []) {
      out[r.role_type] = { coveredByUserId: r.covered_by_user_id, replacesUserId: r.replaces_user_id };
    }
    return out;
  }

  /**
   * Set or update coverage for (agency, role_type, date).
   */
  static async setCoverage(agencyId, roleType, coverageDate, coveredByUserId, replacesUserId = null) {
    const id = parseInt(agencyId, 10);
    if (!id || !roleType || !coverageDate || !coveredByUserId) return null;
    const coveredBy = parseInt(coveredByUserId, 10);
    const replaces = replacesUserId ? parseInt(replacesUserId, 10) : null;
    if (!Number.isFinite(coveredBy)) return null;

    await pool.execute(
      `INSERT INTO agency_team_coverage (agency_id, role_type, covered_by_user_id, coverage_date, replaces_user_id)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE covered_by_user_id = VALUES(covered_by_user_id), replaces_user_id = VALUES(replaces_user_id)`,
      [id, roleType, coveredBy, coverageDate, replaces]
    );
    return this.getCoverageForDate(id, coverageDate);
  }

  /**
   * Delete coverage for (agency, role_type, date).
   */
  static async deleteCoverage(agencyId, roleType, coverageDate) {
    const id = parseInt(agencyId, 10);
    if (!id || !roleType || !coverageDate) return;
    await pool.execute(
      'DELETE FROM agency_team_coverage WHERE agency_id = ? AND role_type = ? AND coverage_date = ?',
      [id, roleType, coverageDate]
    );
  }

  /**
   * List coverage rows for an agency (optionally filtered by date range).
   */
  static async listCoverage(agencyId, fromDate = null, toDate = null) {
    const id = parseInt(agencyId, 10);
    if (!id) return [];
    let sql = `SELECT id, agency_id, role_type, covered_by_user_id, coverage_date, replaces_user_id, note, created_at
               FROM agency_team_coverage WHERE agency_id = ?`;
    const params = [id];
    if (fromDate) {
      sql += ' AND coverage_date >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      sql += ' AND coverage_date <= ?';
      params.push(toDate);
    }
    sql += ' ORDER BY coverage_date ASC, role_type ASC';
    const [rows] = await pool.execute(sql, params);
    return rows || [];
  }

  /**
   * List team for agency with presence, applying coverage for a given date.
   * For roles with coverage: replace members with the covering person.
   */
  static async listForAgencyWithPresenceToday(agencyId, dateStr) {
    const baseRows = await this.listForAgencyWithPresence(agencyId);
    const coverage = await this.getCoverageForDate(agencyId, dateStr);
    if (Object.keys(coverage).length === 0) return baseRows;

    // Build map of role_type -> covering user id
    const coveredByRole = {};
    for (const [rt, c] of Object.entries(coverage)) {
      coveredByRole[rt] = c.coveredByUserId;
    }

    // Get user+presence for covering users we need
    const coveringUserIds = [...new Set(Object.values(coveredByRole))];
    const coveringUsers = await this._getUsersWithPresence(coveringUserIds);

    // For each role with coverage: filter out normal members, add covering person
    const out = [];
    const addedCoveringForRole = new Set();
    for (const r of baseRows) {
      const rt = r.role_type || '_unassigned';
      const coveringId = coveredByRole[rt];
      if (coveringId) {
        // This role has coverage - skip normal members, add covering person once
        if (!addedCoveringForRole.has(rt)) {
          const cu = coveringUsers.get(coveringId);
          if (cu) {
            out.push({
              ...cu,
              role_type: rt,
              display_role: `Covering for ${rt.replace(/_/g, ' ')}`,
              is_covering: true
            });
            addedCoveringForRole.add(rt);
          }
        }
      } else {
        out.push(r);
      }
    }
    // Add covering person for roles that have coverage but no current members
    for (const [rt, coveringId] of Object.entries(coveredByRole)) {
      if (!addedCoveringForRole.has(rt)) {
        const cu = coveringUsers.get(coveringId);
        if (cu) {
          out.push({
            ...cu,
            role_type: rt,
            display_role: `Covering for ${rt.replace(/_/g, ' ')}`,
            is_covering: true
          });
        }
      }
    }
    return out;
  }

  /**
   * Get users with presence by ids. Returns Map<userId, row>.
   */
  static async _getUsersWithPresence(userIds) {
    if (!userIds || userIds.length === 0) return new Map();
    const ids = [...new Set(userIds.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0))];
    if (ids.length === 0) return new Map();

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

    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT u.id,
              u.first_name,
              u.last_name,
              u.email,
              u.role${profilePhotoField}${preferredNameField},
              ps.status AS presence_status,
              ps.note AS presence_note,
              ps.expected_return_at AS presence_expected_return_at
       FROM users u
       LEFT JOIN user_presence_status ps ON ps.user_id = u.id
       WHERE u.id IN (${placeholders})
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)`,
      ids
    );
    const map = new Map();
    for (const r of rows || []) {
      map.set(r.id, r);
    }
    return map;
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
