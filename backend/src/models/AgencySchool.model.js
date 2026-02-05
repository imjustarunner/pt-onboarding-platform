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

  /**
   * Billing schools list: union of legacy agency_schools AND organization_affiliations
   * (the latter is what billing counts as well).
   *
   * NOTE: We only include organization_type='school' here because this list is used
   * for the Billing "Schools" usage breakdown.
   */
  static async listBillingSchoolsByAgency(agencyId, { includeInactive = false } = {}) {
    const parsedAgencyId = parseInt(agencyId, 10);
    const activeClause = includeInactive ? '1=1' : 'asx.is_active = TRUE';

    const [rows] = await pool.execute(
      `SELECT
         'agency_schools' AS source,
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
       WHERE asx.agency_id = ?
         AND s.organization_type = 'school'
         AND (${activeClause})

       UNION ALL

       SELECT
         'organization_affiliations' AS source,
         oa.id,
         oa.agency_id,
         oa.organization_id AS school_organization_id,
         oa.is_active,
         s.name as school_name,
         s.slug as school_slug,
         s.organization_type as school_organization_type,
         s.is_active as school_is_active
       FROM organization_affiliations oa
       INNER JOIN agencies s ON s.id = oa.organization_id
       WHERE oa.agency_id = ?
         AND s.organization_type = 'school'
         AND (${includeInactive ? '1=1' : 'oa.is_active = TRUE'})

       ORDER BY school_name ASC`,
      [parsedAgencyId, parsedAgencyId]
    );

    // De-dupe by school id (prefer active, and prefer legacy agency_schools if tied)
    const bySchoolId = new Map();
    for (const r of rows || []) {
      const sid = Number(r.school_organization_id);
      const prev = bySchoolId.get(sid);
      if (!prev) {
        bySchoolId.set(sid, r);
        continue;
      }
      const prevActive = !!prev.is_active;
      const curActive = !!r.is_active;
      if (curActive && !prevActive) {
        bySchoolId.set(sid, r);
        continue;
      }
      if (curActive === prevActive) {
        if (String(r.source) === 'agency_schools' && String(prev.source) !== 'agency_schools') {
          bySchoolId.set(sid, r);
        }
      }
    }

    return Array.from(bySchoolId.values()).sort((a, b) => String(a.school_name || '').localeCompare(String(b.school_name || '')));
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

