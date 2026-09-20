import pool from '../config/database.js';

// Public offices come from active assignments within this agency, never biography text.
export async function listPublicProviderOffices(agencyId, providerIds, database = pool) {
  const ids = [...new Set(providerIds.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
  const result = new Map(ids.map(id => [id, []]));
  if (!ids.length) return result;
  const [rows] = await database.execute(`SELECT DISTINCT s.provider_id,l.id,l.name,l.street_address,l.city,l.state,l.postal_code
    FROM office_standing_assignments s
    JOIN office_locations l ON l.id=s.office_location_id AND l.is_active=1
    JOIN office_location_agencies a ON a.office_location_id=l.id AND a.agency_id=?
    JOIN user_agencies ua ON ua.user_id=s.provider_id AND ua.agency_id=a.agency_id AND COALESCE(ua.is_active,1)=1
    WHERE s.is_active=1 AND s.provider_id IN (${ids.map(() => '?').join(',')})
    ORDER BY l.name,l.id`, [agencyId, ...ids]);
  for (const row of rows) result.get(Number(row.provider_id))?.push({
    id: Number(row.id), name: row.name, city: row.city || '', state: row.state || '',
    address: [row.street_address,row.city,row.state,row.postal_code].filter(Boolean).join(', ')
  });
  return result;
}
