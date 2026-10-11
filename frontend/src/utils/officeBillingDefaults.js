export function serviceLocationForOffice(locations, officeId, placeOfService) {
  const office = row => Number(row.billing_office_location_id || row.billingOfficeLocationId || 0);
  const matchesPos = row => String(row.place_of_service || row.placeOfService || '') === String(placeOfService);
  return locations.find(row => office(row) === Number(officeId) && matchesPos(row))
    || locations.find(row => !office(row) && matchesPos(row))
    || null;
}
