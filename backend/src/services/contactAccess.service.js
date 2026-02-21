import pool from '../config/database.js';

const AGENCY_ROLES = new Set(['admin', 'staff', 'provider_plus', 'super_admin', 'support']);

export function userCanSeeAllAgencyContacts(role) {
  return AGENCY_ROLES.has(String(role || '').toLowerCase());
}

/**
 * List contact IDs visible to the user for an agency.
 * Used when building filtered contact lists.
 */
export async function listVisibleContactIdsForUser(agencyId, userId, role) {
  if (userCanSeeAllAgencyContacts(role)) {
    const [rows] = await pool.execute(
      'SELECT id FROM agency_contacts WHERE agency_id = ? AND is_active = TRUE',
      [agencyId]
    );
    return rows.map((r) => r.id);
  }

  const [rows] = await pool.execute(
    `SELECT DISTINCT ac.id
     FROM agency_contacts ac
     LEFT JOIN contact_provider_assignments cpa ON cpa.contact_id = ac.id AND cpa.provider_user_id = ?
     LEFT JOIN client_provider_assignments cpa2 ON cpa2.client_id = ac.client_id AND cpa2.provider_user_id = ? AND cpa2.is_active = TRUE
     WHERE ac.agency_id = ?
       AND ac.is_active = TRUE
       AND (
         ac.share_with_all = TRUE
         OR ac.created_by_user_id = ?
         OR (ac.client_id IS NOT NULL AND cpa2.provider_user_id IS NOT NULL)
         OR cpa.provider_user_id IS NOT NULL
       )`,
    [userId, userId, agencyId, userId]
  );
  return rows.map((r) => r.id);
}

/**
 * Check if user can see a specific contact.
 */
export async function userCanSeeContact(contact, userId, role) {
  if (!contact) return false;
  if (userCanSeeAllAgencyContacts(role)) return true;
  if (contact.share_with_all) return true;
  if (Number(contact.created_by_user_id) === Number(userId)) return true;

  if (contact.client_id) {
    const [rows] = await pool.execute(
      `SELECT 1 FROM client_provider_assignments
       WHERE client_id = ? AND provider_user_id = ? AND is_active = TRUE LIMIT 1`,
      [contact.client_id, userId]
    );
    if (rows.length) return true;
  }

  const [rows] = await pool.execute(
    `SELECT 1 FROM contact_provider_assignments
     WHERE contact_id = ? AND provider_user_id = ? LIMIT 1`,
    [contact.id, userId]
  );
  return rows.length > 0;
}
