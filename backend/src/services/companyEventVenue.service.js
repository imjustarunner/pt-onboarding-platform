import pool from '../config/database.js';

// A venue address belongs to the event; employees should not have to supply it on claims.
export async function resolveEventVenueAddress({ eventLocationAddress, publicLocationAddress, eventLocationName, inPersonPublic, organizationId, db = pool }) {
  let address = String(eventLocationAddress || '').trim() || String(publicLocationAddress || '').trim();
  let schoolVenue = false;
  if (!address && organizationId) {
    const [rows] = await db.execute(`SELECT street_address, city, state, postal_code FROM agencies
      WHERE id = ? AND organization_type = 'school'`, [organizationId]);
    schoolVenue = rows.length > 0;
    const school = rows[0];
    if (school?.street_address?.trim()) address = [school.street_address, school.city, school.state, school.postal_code].filter(Boolean).join(', ');
  }
  if (!address && (String(eventLocationName || '').trim() || inPersonPublic || schoolVenue)) {
    throw Object.assign(new Error('Add the venue’s full street address, city, state, and ZIP before saving this event.'), { status: 400 });
  }
  return address.slice(0, 500) || null;
}
