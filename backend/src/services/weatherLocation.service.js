import pool from '../config/database.js';
export function usableWeatherAddress(home) {
  return /^\d{5}(-\d{4})?$/.test(String(home?.home_postal_code || '').trim())
    || (!!String(home?.home_city || '').trim() && /^[A-Za-z]{2}$/.test(String(home?.home_state || '').trim()));
}
export async function resolveWeatherLocation(userId, home, { officeFallback = false, db = pool } = {}) {
  if (usableWeatherAddress(home) || !officeFallback) return { home, source: 'home', label: [home?.home_city, home?.home_state].filter(Boolean).join(', ') || (home?.home_postal_code ? `Home area · ZIP ${home.home_postal_code}` : 'Your home area') };
  const [rows] = await db.execute(`SELECT ol.name,ol.street_address,ol.city,ol.state,ol.postal_code,uol.is_primary
    FROM user_office_locations uol JOIN office_locations assigned ON assigned.id=uol.office_location_id AND assigned.is_active=1
    JOIN office_locations ol ON ol.id=COALESCE(assigned.physical_office_location_id,assigned.id) AND ol.is_active=1
    WHERE uol.user_id=? AND uol.is_active=1 ORDER BY uol.is_primary DESC,ol.id`, [userId]);
  const primaries = rows.filter(row => Number(row.is_primary) === 1);
  const office = primaries.length === 1 ? primaries[0] : rows.length === 1 ? rows[0] : null;
  if (!office) return { home, source: 'home', label: 'Your home area' };
  return { source: 'primary_office', label: [office.name, [office.city, office.state].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
    home: { home_street_address: office.street_address, home_city: office.city, home_state: office.state, home_postal_code: office.postal_code } };
}
