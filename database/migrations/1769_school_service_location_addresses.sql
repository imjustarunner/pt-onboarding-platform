-- Migration 1769: school service locations keep the school's address.
UPDATE agency_service_locations l
INNER JOIN agencies school ON school.id = l.school_organization_id
SET
  l.street_address = COALESCE(NULLIF(l.street_address, ''), school.street_address),
  l.city = COALESCE(NULLIF(l.city, ''), school.city),
  l.state = COALESCE(NULLIF(l.state, ''), school.state),
  l.postal_code = COALESCE(NULLIF(l.postal_code, ''), school.postal_code),
  l.location_kind = 'school',
  l.place_of_service = COALESCE(NULLIF(l.place_of_service, ''), '03')
WHERE l.school_organization_id IS NOT NULL;
