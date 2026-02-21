import pool from '../config/database.js';

/**
 * Resolve agency contacts for mass-communications targeting.
 * Used by campaigns to target contacts by school, provider, or client.
 *
 * @param {number} agencyId
 * @param {{ schoolId?: number, providerId?: number, clientId?: number }} target
 * @returns {Promise<Array<{ id: number, full_name: string, email: string|null, phone: string|null }>>}
 */
export async function resolveContactsForAudience(agencyId, target = {}) {
  const { schoolId, providerId, clientId } = target;
  if (!agencyId) return [];

  const conditions = ['ac.agency_id = ?', 'ac.is_active = TRUE'];
  const params = [agencyId];

  if (schoolId) {
    conditions.push(
      'EXISTS (SELECT 1 FROM contact_school_assignments csa WHERE csa.contact_id = ac.id AND csa.school_organization_id = ?)'
    );
    params.push(parseInt(schoolId, 10));
  }
  if (providerId) {
    conditions.push(
      'EXISTS (SELECT 1 FROM contact_provider_assignments cpa WHERE cpa.contact_id = ac.id AND cpa.provider_user_id = ?)'
    );
    params.push(parseInt(providerId, 10));
  }
  if (clientId) {
    conditions.push('ac.client_id = ?');
    params.push(parseInt(clientId, 10));
  }

  const [rows] = await pool.execute(
    `SELECT ac.id, ac.full_name, ac.email, ac.phone
     FROM agency_contacts ac
     WHERE ${conditions.join(' AND ')}
     ORDER BY ac.full_name ASC`,
    params
  );

  return (rows || []).map((r) => ({
    id: r.id,
    full_name: r.full_name,
    email: r.email || null,
    phone: r.phone || null
  }));
}
