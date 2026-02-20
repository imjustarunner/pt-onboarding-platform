import pool from '../config/database.js';

class OrganizationAffiliation {
  /**
   * True if agency has at least one affiliated org with organization_type = 'clinical'.
   * Used to gate clinical notes/billing features to agencies with clinical org context.
   */
  static async agencyHasClinicalOrg(agencyId) {
    const orgs = await this.listActiveOrganizationsForAgency(agencyId);
    return (orgs || []).some((o) => String(o?.organization_type || '').toLowerCase() === 'clinical');
  }

  /**
   * True if agency has at least one affiliated org with organization_type
   * that supports session workflows outside pure school-only programs.
   */
  static async agencyHasLearningOrg(agencyId) {
    const orgs = await this.listActiveOrganizationsForAgency(agencyId);
    return (orgs || []).some((o) => ['learning', 'program'].includes(String(o?.organization_type || '').toLowerCase()));
  }

  static async listActiveOrganizationsForAgency(agencyId) {
    const aId = parseInt(agencyId, 10);
    if (!aId) return [];
    const [rows] = await pool.execute(
      `SELECT org.*
       FROM organization_affiliations oa
       INNER JOIN agencies org ON oa.organization_id = org.id
       WHERE oa.agency_id = ? AND oa.is_active = TRUE
       ORDER BY org.name ASC`,
      [aId]
    );
    // Some legacy/manual-created org rows may have a NULL/empty organization_type even though they are
    // affiliated under an agency (and therefore should behave like a school/program/learning org).
    // Default those to 'school' so UI + overview logic doesn't mis-classify them as a parent agency.
    const out = Array.isArray(rows) ? rows : [];
    for (const r of out) {
      const raw = r?.organization_type;
      const t = raw === null || raw === undefined ? '' : String(raw).trim().toLowerCase();
      if (!t) {
        r.organization_type = 'school';
      }
    }
    return out;
  }

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

