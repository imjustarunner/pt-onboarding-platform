import pool from '../config/database.js';

class SchoolRoiIntakeLinkConfig {
  static normalize(row) {
    if (!row) return null;
    return {
      ...row,
      id: Number(row.id),
      school_organization_id: Number(row.school_organization_id),
      intake_link_id: Number(row.intake_link_id),
      created_by_user_id: row.created_by_user_id ? Number(row.created_by_user_id) : null,
      updated_by_user_id: row.updated_by_user_id ? Number(row.updated_by_user_id) : null
    };
  }

  static async findBySchoolOrganizationId(schoolOrganizationId) {
    const sid = Number(schoolOrganizationId || 0);
    if (!sid) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM school_roi_intake_link_configs
       WHERE school_organization_id = ?
       LIMIT 1`,
      [sid]
    );
    return this.normalize(rows?.[0] || null);
  }

  static async upsert({ schoolOrganizationId, intakeLinkId, actorUserId = null }) {
    const sid = Number(schoolOrganizationId || 0);
    const linkId = Number(intakeLinkId || 0);
    const actorId = Number(actorUserId || 0) || null;
    if (!sid || !linkId) return null;
    await pool.execute(
      `INSERT INTO school_roi_intake_link_configs
         (school_organization_id, intake_link_id, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         intake_link_id = VALUES(intake_link_id),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [sid, linkId, actorId, actorId]
    );
    return this.findBySchoolOrganizationId(sid);
  }

  static async clearBySchoolOrganizationId(schoolOrganizationId) {
    const sid = Number(schoolOrganizationId || 0);
    if (!sid) return false;
    await pool.execute(
      'DELETE FROM school_roi_intake_link_configs WHERE school_organization_id = ?',
      [sid]
    );
    return true;
  }
}

export default SchoolRoiIntakeLinkConfig;
