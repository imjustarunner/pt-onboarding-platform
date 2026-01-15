import pool from '../config/database.js';

class BillingUsageService {
  static async getUsage(agencyId) {
    const parsedAgencyId = parseInt(agencyId, 10);
    if (!parsedAgencyId || Number.isNaN(parsedAgencyId)) {
      throw new Error('Invalid agencyId');
    }

    // Schools (explicit linkage)
    const [schoolsRows] = await pool.execute(
      `SELECT COUNT(*) as cnt
       FROM agency_schools
       WHERE agency_id = ? AND is_active = TRUE`,
      [parsedAgencyId]
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

