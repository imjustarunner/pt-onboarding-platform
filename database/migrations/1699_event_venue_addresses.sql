-- Reuse known venue addresses without guessing or overwriting an existing address.
UPDATE company_events
SET event_location_address = LEFT(TRIM(public_location_address), 500)
WHERE NULLIF(TRIM(event_location_address), '') IS NULL
  AND NULLIF(TRIM(public_location_address), '') IS NOT NULL;

UPDATE company_events e
JOIN agencies s ON s.id = e.organization_id AND s.organization_type = 'school'
SET e.event_location_address = LEFT(CONCAT_WS(', ', NULLIF(TRIM(s.street_address), ''),
    NULLIF(TRIM(s.city), ''), NULLIF(TRIM(s.state), ''), NULLIF(TRIM(s.postal_code), '')), 500)
WHERE NULLIF(TRIM(e.event_location_address), '') IS NULL
  AND NULLIF(TRIM(s.street_address), '') IS NOT NULL;
