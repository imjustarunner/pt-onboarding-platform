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

// Older editors omit venue fields. Preserve their saved venue on unrelated edits.
export async function prepareEventVenueUpdate({ body = {}, existing = {}, organizationId, requireAddress = false, db = pool }) {
  const hasName = body.eventLocationName !== undefined || body.event_location_name !== undefined;
  const hasAddress = body.eventLocationAddress !== undefined || body.event_location_address !== undefined;
  if (!hasName && !hasAddress) return null;
  const name = String((hasName ? body.eventLocationName ?? body.event_location_name : existing.event_location_name) || '').trim().slice(0, 255) || null;
  const address = await resolveEventVenueAddress({
    eventLocationName: name,
    eventLocationAddress: hasAddress ? body.eventLocationAddress ?? body.event_location_address : existing.event_location_address,
    publicLocationAddress: existing.public_location_address,
    organizationId, inPersonPublic: requireAddress, db
  });
  return { name, address };
}

export async function saveEventVenue({ eventId, agencyId, venue, db = pool }) {
  if (!venue) return;
  await db.execute(`UPDATE company_events SET event_location_name = ?, event_location_address = ?
    WHERE id = ? AND agency_id = ?`, [venue.name, venue.address, eventId, agencyId]);
}
