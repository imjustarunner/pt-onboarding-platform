import pool from '../config/database.js';

class OrganizationAffiliation {
  static async getActiveAgencyIdForOrganization(organizationId) {
    const orgId = parseInt(organizationId, 10);
    if (!orgId) return null;
    const [rows] = await pool.execute(
      `SELECT agency_id
       FROM organization_affiliations
       WHERE organization_id = ? AND is_active = TRUE
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
      [orgId]
    );
    return rows?.[0]?.agency_id || null;
  }

  static async deactivateAllForOrganization(organizationId) {
    const orgId = parseInt(organizationId, 10);
    if (!orgId) return 0;
    const [result] = await pool.execute(
      `UPDATE organization_affiliations
       SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE organization_id = ?`,
      [orgId]
    );
    return result.affectedRows || 0;
  }

  static async upsert({ agencyId, organizationId, isActive = true }) {
    const aId = parseInt(agencyId, 10);
    const oId = parseInt(organizationId, 10);
    if (!aId || !oId) throw new Error('agencyId and organizationId are required');

    await pool.execute(
      `INSERT INTO organization_affiliations (agency_id, organization_id, is_active)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE is_active = VALUES(is_active), updated_at = CURRENT_TIMESTAMP`,
      [aId, oId, !!isActive]
    );

    const [rows] = await pool.execute(
      `SELECT * FROM organization_affiliations WHERE agency_id = ? AND organization_id = ? LIMIT 1`,
      [aId, oId]
    );
    return rows[0] || null;
  }
}

export default OrganizationAffiliation;

