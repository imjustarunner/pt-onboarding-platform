import pool from '../config/database.js';

// Use the actual agency/provider service rate sheet, not the user's global profile.
// Different individual counseling rates require a service-specific quote.
export async function getPublicCounselingHourlyRate({ agencyId, providerUserId, serviceType = 'counseling' }) {
  if (serviceType !== 'counseling') return null;
  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT r.rate_cents
       FROM self_pay_service_rates r
       JOIN tenant_services s ON s.id = r.tenant_service_id AND s.agency_id = r.agency_id
       WHERE r.agency_id = ? AND r.provider_user_id = ? AND r.rate_unit = 'hour'
         AND s.business_type = 'mental_health' AND s.is_active = 1
         AND s.allows_individual = 1 AND s.allows_group = 0`,
      [Number(agencyId), Number(providerUserId)]
    );
    return rows.length === 1 ? Number(rows[0].rate_cents) : null;
  } catch (error) {
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) return null;
    throw error;
  }
}
