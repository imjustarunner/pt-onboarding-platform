import pool from '../config/database.js';

function mapProviderRow(row = {}) {
  const first = String(row.first_name || '').trim();
  const last = String(row.last_name || '').trim();
  const name = `${first} ${last}`.trim() || 'Provider';
  const openSlots = Number(row.open_slots || 0);
  return {
    id: Number(row.id),
    firstName: first,
    lastName: last,
    name,
    displayName: name,
    title: String(row.title || '').trim() || null,
    credential: String(row.credential || '').trim() || null,
    acceptingNewClients: row.accepting == null ? true : Number(row.accepting) === 1,
    inOfficeAvailable: Number(row.in_office_available || 0) === 1,
    openSlots,
    waitlist: openSlots <= 0
  };
}

/**
 * Office intake provider list: globally available clinicians, with open
 * in-office slots first. Zero-slot rows are waitlist.
 */
export async function listOfficeIntakeProviders(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return [];

  const withSlots = `
    SELECT u.id,
           u.first_name,
           u.last_name,
           u.title,
           COALESCE(u.provider_accepting_new_clients, 1) AS accepting,
           COALESCE(u.in_office_available, 0) AS in_office_available,
           COALESCE(slot.open_slots, 0) AS open_slots
      FROM users u
      INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
      LEFT JOIN (
        SELECT provider_id, COUNT(*) AS open_slots
          FROM provider_in_office_availability
         WHERE is_available = 1
         GROUP BY provider_id
      ) slot ON slot.provider_id = u.id
     WHERE u.is_active = 1
       AND (
         COALESCE(u.in_office_available, 0) = 1
         OR COALESCE(u.provider_accepting_new_clients, 1) = 1
       )
       AND (
         u.role IN ('provider', 'counselor', 'therapist', 'coach', 'employee')
         OR ua.role IN ('provider', 'counselor', 'coach', 'therapist')
       )
     ORDER BY open_slots DESC, u.last_name ASC, u.first_name ASC`;

  const withoutSlots = `
    SELECT u.id,
           u.first_name,
           u.last_name,
           u.title,
           COALESCE(u.provider_accepting_new_clients, 1) AS accepting,
           0 AS in_office_available,
           0 AS open_slots
      FROM users u
      INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
     WHERE u.is_active = 1
       AND COALESCE(u.provider_accepting_new_clients, 1) = 1
       AND (
         u.role IN ('provider', 'counselor', 'therapist', 'coach', 'employee')
         OR ua.role IN ('provider', 'counselor', 'coach', 'therapist')
       )
     ORDER BY u.last_name ASC, u.first_name ASC`;

  try {
    const [rows] = await pool.execute(withSlots, [aid]);
    return (rows || []).map(mapProviderRow);
  } catch (err) {
    const msg = String(err?.message || '');
    if (!/unknown column|doesn't exist|er_no_such_table/i.test(msg)) {
      console.warn('[officeIntakeProviders] list failed', msg);
      return [];
    }
    try {
      const [rows] = await pool.execute(withoutSlots, [aid]);
      return (rows || []).map(mapProviderRow);
    } catch (fallbackErr) {
      console.warn('[officeIntakeProviders] fallback list failed', fallbackErr?.message || fallbackErr);
      return [];
    }
  }
}
