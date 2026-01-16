import pool from '../config/database.js';

class AgencySchool {
  static async getActiveAgencyIdForSchool(schoolOrganizationId) {
    const sId = parseInt(schoolOrganizationId, 10);
    if (!sId) return null;
    const [rows] = await pool.execute(
      `SELECT agency_id
       FROM agency_schools
       WHERE school_organization_id = ? AND is_active = TRUE
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
      [sId]
    );
    return rows?.[0]?.agency_id || null;
  }

  static async listByAgency(agencyId, { includeInactive = false } = {}) {
    const parsedAgencyId = parseInt(agencyId, 10);
    const conditions = ['asx.agency_id = ?'];
    const params = [parsedAgencyId];
    if (!includeInactive) {
      conditions.push('asx.is_active = TRUE');
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await pool.execute(
      `SELECT
         asx.id,
         asx.agency_id,
         asx.school_organization_id,
         asx.is_active,
         s.name as school_name,
         s.slug as school_slug,
         s.organization_type as school_organization_type,
         s.is_active as school_is_active
       FROM agency_schools asx
       INNER JOIN agencies s ON s.id = asx.school_organization_id
       ${where}
       ORDER BY s.name ASC`,
      params
    );
    return rows;
  }

  static async upsert({ agencyId, schoolOrganizationId, isActive = true }) {
    const aId = parseInt(agencyId, 10);
    const sId = parseInt(schoolOrganizationId, 10);
    if (!aId || !sId) throw new Error('agencyId and schoolOrganizationId are required');

    await pool.execute(
      `INSERT INTO agency_schools (agency_id, school_organization_id, is_active)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE is_active = VALUES(is_active), updated_at = CURRENT_TIMESTAMP`,
      [aId, sId, !!isActive]
    );

    // Return the row
    const [rows] = await pool.execute(
      `SELECT * FROM agency_schools WHERE agency_id = ? AND school_organization_id = ? LIMIT 1`,
      [aId, sId]
    );
    return rows[0] || null;
  }

  static async setActive({ agencyId, schoolOrganizationId, isActive }) {
    const aId = parseInt(agencyId, 10);
    const sId = parseInt(schoolOrganizationId, 10);
    const [result] = await pool.execute(
      `UPDATE agency_schools SET is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE agency_id = ? AND school_organization_id = ?`,
      [!!isActive, aId, sId]
    );
    return result.affectedRows > 0;
  }
}

export default AgencySchool;

