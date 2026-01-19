import pool from '../config/database.js';

class BillingUsageService {
  static async getUsage(agencyId) {
    const parsedAgencyId = parseInt(agencyId, 10);
    if (!parsedAgencyId || Number.isNaN(parsedAgencyId)) {
      throw new Error('Invalid agencyId');
    }

    // Schools
    // Historically: agency_schools linkage.
    // Current org model: schools are organizations (agencies table with organization_type='school')
    // linked via organization_affiliations. Count both, de-duplicated.
    const [schoolsRows] = await pool.execute(
      `SELECT COUNT(DISTINCT school_id) as cnt
       FROM (
         SELECT s.school_organization_id AS school_id
         FROM agency_schools s
         WHERE s.agency_id = ? AND s.is_active = TRUE
         UNION
         SELECT oa.organization_id AS school_id
         FROM organization_affiliations oa
         INNER JOIN agencies a ON a.id = oa.organization_id
         WHERE oa.agency_id = ?
           AND oa.is_active = TRUE
           AND a.is_active = TRUE
           AND a.organization_type = 'school'
       ) t`,
      [parsedAgencyId, parsedAgencyId]
    );

    // Programs (agency-owned training tracks)
    const [programRows] = await pool.execute(
      `SELECT COUNT(*) as cnt
       FROM training_tracks tt
       WHERE tt.agency_id = ?
         AND tt.is_active = TRUE
         AND (tt.is_archived = FALSE OR tt.is_archived IS NULL)`,
      [parsedAgencyId]
    );

    // Admins (billable admin users assigned to agency)
    const [adminRows] = await pool.execute(
      `SELECT COUNT(DISTINCT u.id) as cnt
       FROM users u
       INNER JOIN user_agencies ua ON u.id = ua.user_id
       WHERE ua.agency_id = ?
         AND u.role = 'admin'
         AND u.is_active = TRUE
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)`,
      [parsedAgencyId]
    );

    // Active onboardees (status ONBOARDING)
    const [onboardeeRows] = await pool.execute(
      `SELECT COUNT(DISTINCT u.id) as cnt
       FROM users u
       INNER JOIN user_agencies ua ON u.id = ua.user_id
       WHERE ua.agency_id = ?
         AND u.status = 'ONBOARDING'
         AND u.is_active = TRUE
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)`,
      [parsedAgencyId]
    );

    return {
      schoolsUsed: Number(schoolsRows?.[0]?.cnt || 0),
      programsUsed: Number(programRows?.[0]?.cnt || 0),
      adminsUsed: Number(adminRows?.[0]?.cnt || 0),
      activeOnboardeesUsed: Number(onboardeeRows?.[0]?.cnt || 0)
    };
  }
}

export default BillingUsageService;

