import pool from '../config/database.js';

function dateOnlyString(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

class BillingUsageService {
  static async getUsage(agencyId, { periodStart = null, periodEnd = null } = {}) {
    const parsedAgencyId = parseInt(agencyId, 10);
    if (!parsedAgencyId || Number.isNaN(parsedAgencyId)) {
      throw new Error('Invalid agencyId');
    }

    // Optional period window (used for SMS usage billing).
    // We treat periodStart/End as DATEs and query created_at in [start, end+1day).
    const startStr = dateOnlyString(periodStart);
    const endStr = dateOnlyString(periodEnd);
    const hasWindow = !!(startStr && endStr);

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

    // Outbound-to-client SMS (message_logs) within billing period (sent only).
    const [outboundSmsRows] = await pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM message_logs ml
       WHERE ml.agency_id = ?
         AND ml.direction = 'OUTBOUND'
         AND ml.delivery_status = 'sent'
         AND (? = FALSE OR (ml.created_at >= ? AND ml.created_at < DATE_ADD(?, INTERVAL 1 DAY)))`,
      [parsedAgencyId, hasWindow ? 1 : 0, startStr || '1970-01-01', endStr || '1970-01-01']
    );

    // Inbound-from-client SMS (message_logs) within billing period (received).
    const [inboundSmsRows] = await pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM message_logs ml
       WHERE ml.agency_id = ?
         AND ml.direction = 'INBOUND'
         AND ml.delivery_status = 'received'
         AND (? = FALSE OR (ml.created_at >= ? AND ml.created_at < DATE_ADD(?, INTERVAL 1 DAY)))`,
      [parsedAgencyId, hasWindow ? 1 : 0, startStr || '1970-01-01', endStr || '1970-01-01']
    );

    // Notification SMS (notification_sms_logs) within billing period (sent only).
    const [notificationSmsRows] = await pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM notification_sms_logs nsl
       WHERE nsl.agency_id = ?
         AND nsl.status = 'sent'
         AND (? = FALSE OR (nsl.created_at >= ? AND nsl.created_at < DATE_ADD(?, INTERVAL 1 DAY)))`,
      [parsedAgencyId, hasWindow ? 1 : 0, startStr || '1970-01-01', endStr || '1970-01-01']
    );

    // Active phone numbers (Twilio numbers owned by agency)
    const [phoneRows] = await pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM twilio_numbers tn
       WHERE tn.agency_id = ?
         AND tn.is_active = TRUE
         AND tn.status <> 'released'`,
      [parsedAgencyId]
    );

    return {
      schoolsUsed: Number(schoolsRows?.[0]?.cnt || 0),
      programsUsed: Number(programRows?.[0]?.cnt || 0),
      adminsUsed: Number(adminRows?.[0]?.cnt || 0),
      activeOnboardeesUsed: Number(onboardeeRows?.[0]?.cnt || 0),
      outboundSmsUsed: Number(outboundSmsRows?.[0]?.cnt || 0),
      inboundSmsUsed: Number(inboundSmsRows?.[0]?.cnt || 0),
      notificationSmsUsed: Number(notificationSmsRows?.[0]?.cnt || 0),
      phoneNumbersUsed: Number(phoneRows?.[0]?.cnt || 0)
    };
  }
}

export default BillingUsageService;

